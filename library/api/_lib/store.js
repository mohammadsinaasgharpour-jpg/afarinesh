// Where the live catalog is kept: a private Vercel Blob store in production, or a folder on disk when
// LOCAL_STORE_DIR is set (scripts/dev-server.mjs). Until the first save, the catalog is the static
// data/books.json exported from Excel.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const KEY = "catalog/books.json";
const HISTORY = "catalog/history/";

export class ConflictError extends Error {}
export class StorageMissingError extends Error {}

const local = () => process.env.LOCAL_STORE_DIR;
// A store connected in the dashboard sets BLOB_STORE_ID (signed in through Vercel's OIDC token at run time);
// older connections set BLOB_READ_WRITE_TOKEN instead. Either is enough.
const connected = () => Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);

async function blob() {
  if (!connected()) throw new StorageMissingError("no Blob store connected (BLOB_STORE_ID / BLOB_READ_WRITE_TOKEN)");
  return import("@vercel/blob");
}

/** @returns {Promise<{data: object, version: string} | null>} null while nothing has been saved yet */
export async function readSaved() {
  if (local()) {
    try {
      const text = await readFile(path.join(local(), KEY), "utf8");
      return { data: JSON.parse(text), version: createHash("sha256").update(text).digest("hex") };
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }
  if (!connected()) return null; // storage not connected yet: serve the static snapshot
  const { get, head, BlobNotFoundError } = await blob();
  // The version comes from head(): get()'s ETag is the CDN's weak one (W/"…"), which a conditional put
  // never matches. Reading head first means a save landing in between shows up as a conflict, not a lost update.
  let version;
  try {
    version = (await head(KEY)).etag;
  } catch (e) {
    if (e instanceof BlobNotFoundError) return null;
    throw e;
  }
  const got = await get(KEY, { access: "private", useCache: false });
  if (!got || !got.stream) return null;
  return { data: JSON.parse(await new Response(got.stream).text()), version };
}

/** Writes the whole catalog only if nobody saved since `version` was read; keeps a dated copy as history. */
export async function writeSaved(data, version) {
  const text = JSON.stringify(data, null, 1);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (local()) {
    const current = await readSaved();
    if ((current?.version ?? null) !== (version ?? null)) throw new ConflictError();
    await mkdir(path.join(local(), HISTORY), { recursive: true });
    await writeFile(path.join(local(), KEY), text, "utf8");
    await writeFile(path.join(local(), HISTORY, `${stamp}.json`), text, "utf8");
    return createHash("sha256").update(text).digest("hex");
  }
  const { put, BlobPreconditionFailedError } = await blob();
  const opts = { access: "private", contentType: "application/json; charset=utf-8", addRandomSuffix: false };
  let saved;
  try {
    saved = await put(KEY, text, version ? { ...opts, ifMatch: version } : opts);
  } catch (e) {
    // a first save racing another first save also lands here: the blob now exists
    if (e instanceof BlobPreconditionFailedError || /already exists/i.test(e.message)) throw new ConflictError();
    throw e;
  }
  await put(`${HISTORY}${stamp}.json`, text, opts).catch(() => {}); // history is a convenience, not a requirement
  return saved.etag;
}

const textVersion = (text) => createHash("sha256").update(text).digest("hex");

/**
 * A small private JSON document (e.g. the sign-in attempt counter) with its version, for writeDocIf.
 * @returns {Promise<{data: object, version: string} | null>} null when it doesn't exist or no store is connected
 */
export async function readDocVersioned(key) {
  if (local()) {
    let text;
    try { text = await readFile(path.join(local(), key), "utf8"); } catch (e) { if (e.code === "ENOENT") return null; throw e; }
    return { data: JSON.parse(text), version: textVersion(text) };
  }
  if (!connected()) return null;
  const { get, head, BlobNotFoundError } = await blob();
  let version;
  try {
    version = (await head(key)).etag; // as in readSaved: get()'s ETag is the CDN's weak one
  } catch (e) {
    if (e instanceof BlobNotFoundError) return null;
    throw e;
  }
  const got = await get(key, { access: "private", useCache: false });
  return got?.stream ? { data: JSON.parse(await new Response(got.stream).text()), version } : null;
}

/**
 * Writes the document only if it is still at `version` (null: only if it doesn't exist yet), so two writers
 * can't silently overwrite each other. Throws ConflictError otherwise. The local store is only used by the
 * dev server, a single process whose callers serialise their own updates.
 */
export async function writeDocIf(key, data, version) {
  const text = JSON.stringify(data);
  if (local()) {
    const file = path.join(local(), key);
    let now = null;
    try { now = textVersion(await readFile(file, "utf8")); } catch (e) { if (e.code !== "ENOENT") throw e; }
    if (now !== (version ?? null)) throw new ConflictError();
    await mkdir(path.dirname(file), { recursive: true });
    return writeFile(file, text, "utf8");
  }
  if (!connected()) return;
  const { put, BlobPreconditionFailedError } = await blob();
  const opts = { access: "private", contentType: "application/json", addRandomSuffix: false };
  try {
    await put(key, text, version ? { ...opts, ifMatch: version, allowOverwrite: true } : opts);
  } catch (e) {
    if (e instanceof BlobPreconditionFailedError || /already exists/i.test(e.message)) throw new ConflictError();
    throw e;
  }
}

export async function seed(siteOrigin) {
  const res = await fetch(`${siteOrigin}/data/books.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`seed catalog: HTTP ${res.status}`);
  return res.json();
}

export async function current(siteOrigin) {
  return (await readSaved()) ?? { data: await seed(siteOrigin), version: null };
}
