// Prints the admin_password_hash line for /home/mqcmfbjf/afarinesh-config.php (read by php/api/admin.php).
// Usage: node scripts/hash-admin-password.mjs   (asks for the password; nothing is written to disk)
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";

export function hashAdminPassword(password, iterations = 210_000) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  return `pbkdf2_sha256$${iterations}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const pw = await rl.question("New admin password (8+ characters): ");
  rl.close();
  if (pw.length < 8) { console.error("Too short."); process.exit(1); }
  console.log(`'admin_password_hash' => '${hashAdminPassword(pw)}',`);
}
