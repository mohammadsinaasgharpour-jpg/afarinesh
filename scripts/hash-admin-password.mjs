import { hashAdminPassword } from "../server/admin.mjs";

const password = process.argv[2];
if (!password || password.length < 12) throw new Error("Pass a password with at least 12 characters.");
console.log(hashAdminPassword(password));
