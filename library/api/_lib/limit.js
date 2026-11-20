// Sign-in throttling. Every attempt is counted before the password is compared, so a burst of parallel guesses
// is refused once the limit is reached instead of all being checked at the same time. Two layers:
//  - this instance's memory, counted with no await in between, so it is exact for everything one instance sees;
//  - a private stored document, written only if nobody changed it since it was read (retried on conflict),
//    so the counts of all instances add up.
// Limits: 5 attempts per address in 15 minutes, and 50 for all addresses together in an hour; either locks
// sign-in for 15 minutes. A correct password gives its attempt back. Addresses are stored only as salted hashes.
import { createHash } from "node:crypto";
import { ConflictError, readDocVersioned, writeDocIf } from "./store.js";
import { clientIp } from "./telegram.js";

const KEY = "security/sign-in-attempts.json";
const ALL = "*"; // the entry counting every address together
const MINUTE = 60 * 1000;
const PER_ADDRESS = { max: 5, window: 15 * MINUTE, lock: 15 * MINUTE };
const OVERALL = { max: 50, window: 60 * MINUTE, lock: 15 * MINUTE };
const RETRIES = 5;

const limitFor = (key) => (key === ALL ? OVERALL : PER_ADDRESS);

function addressKey(req) {
  // salted with the admin password so the stored hashes are useless anywhere else
  return createHash("sha256").update(`afarinash-ip\0${process.env.ADMIN_PASSWORD || ""}\0${clientIp(req) || "unknown"}`).digest("hex").slice(0, 24);
}

function prune(all, now) {
  for (const [k, e] of Object.entries(all)) if (now - e.first > limitFor(k).window && !(e.until > now)) delete all[k];
  return all;
}

/** Counts one attempt into `all` for each key; returns the seconds to wait instead if any of them is locked. */
function reserve(all, keys, now) {
  for (const k of keys) if (all[k]?.until > now) return Math.ceil((all[k].until - now) / 1000);
  for (const k of keys) {
    const { max, window, lock } = limitFor(k);
    const e = all[k] && now - all[k].first <= window ? all[k] : { first: now, fails: 0 };
    e.fails += 1;
    if (e.fails >= max) e.until = now + lock; // this attempt still runs; the next one waits
    all[k] = e;
  }
  return 0;
}

function release(all, [address, overall]) {
  delete all[address];
  if (all[overall]) all[overall].fails = Math.max(0, all[overall].fails - 1);
}

const memory = {};
let queue = Promise.resolve(); // one stored update at a time per instance; other instances are caught by the version check

/** Applies `change` to the stored counts and saves them; returns what `change` returned (seconds to wait, or 0). */
function updateStored(change) {
  const run = queue.then(async () => {
    for (let i = 0; i < RETRIES; i++) {
      let doc;
      try {
        doc = await readDocVersioned(KEY);
      } catch (e) {
        console.error("sign-in limit read:", e.message); // storage unreachable: the memory layer still applies
        return 0;
      }
      const all = prune(doc?.data ?? {}, Date.now());
      const wait = change(all);
      if (wait) return wait;
      try {
        await writeDocIf(KEY, all, doc?.version ?? null);
        return 0;
      } catch (e) {
        if (!(e instanceof ConflictError)) {
          console.error("sign-in limit write:", e.message);
          return 0;
        }
      }
      await new Promise((r) => setTimeout(r, 20 + Math.random() * 80)); // another instance saved first: re-read
    }
    return 30; // the attempt could not be recorded; refuse it briefly rather than check a password uncounted
  });
  queue = run.catch(() => {});
  return run;
}

/** Counts a sign-in attempt. @returns {Promise<number>} seconds to wait (the attempt is refused), or 0 */
export async function reserveAttempt(req) {
  const keys = [addressKey(req), ALL];
  const wait = reserve(prune(memory, Date.now()), keys, Date.now());
  if (wait) return wait;
  return updateStored((all) => reserve(all, keys, Date.now()));
}

/** After a correct password: this address starts again from zero, and its attempt leaves the overall count. */
export async function releaseAttempt(req) {
  const keys = [addressKey(req), ALL];
  release(memory, keys);
  await updateStored((all) => (release(all, keys), 0));
}
