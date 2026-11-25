// Prints the admin_password_hash line for /home/mqcmfbjf/afarinesh-config.php (read by php/api/admin.php).
// Usage: node scripts/hash-admin-password.mjs   (asks for the password twice, typing stays hidden; nothing is written to disk)
import { pbkdf2Sync, randomBytes } from "node:crypto";

export function hashAdminPassword(password, iterations = 210_000) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  return `pbkdf2_sha256$${iterations}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function askHidden(label) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    stdout.write(label);
    let value = "";
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          return resolve(value);
        }
        if (ch === "\u0003") process.exit(130);
        if (ch === "\u007f" || ch === "\b") { if (value) { value = value.slice(0, -1); stdout.write("\b \b"); } continue; }
        value += ch;
        stdout.write("*");
      }
    };
    stdin.on("data", onData);
  });
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const pw = await askHidden("New admin password (8+ characters): ");
  if (pw.length < 8) { console.error("Too short."); process.exit(1); }
  if ((await askHidden("Type it again: ")) !== pw) { console.error("The two entries differ."); process.exit(1); }
  console.log(`'admin_password_hash' => '${hashAdminPassword(pw)}',`);
}
