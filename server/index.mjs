import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.PORT) || 8080;
const host = process.env.HOST || "127.0.0.1";

const server = createServer(createApp({
  publicDir: process.env.PUBLIC_DIR || `${root}public`,
  dataDir: process.env.DATA_DIR || `${root}data`,
}));
server.headersTimeout = 15_000;
server.requestTimeout = 20_000;

server.listen(port, host, () => console.log(`Afarinesh site on http://${host}:${port}`));

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    console.log(`${sig}: closing`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  });
}
