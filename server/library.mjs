import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".xml": "application/xml; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp", ".png": "image/png", ".woff2": "font/woff2",
};

const ROUTES = {
  "/api/home": "api/home.js", "/api/books": "api/books.js", "/api/session": "api/session.js",
  "/api/admin/catalog": "api/admin/catalog.js", "/api/admin/telegram": "api/admin/telegram.js",
  "/api/request": "api/request.js", "/api/telegram": "api/telegram.js",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(body));
}

function rewriteMountedText(text, ext) {
  if (ext === ".js") return text.replaceAll('"/api/', '"/library/api/').replaceAll("'/api/", "'/library/api/");
  if (ext === ".css") return text.replaceAll("url(/", "url(/library/");
  if (ext !== ".html") return text;
  return text
    .replaceAll('href="/', 'href="/library/')
    .replaceAll("href='/", "href='/library/")
    .replaceAll('src="/', 'src="/library/')
    .replaceAll("src='/", "src='/library/")
    .replaceAll('action="/', 'action="/library/')
    .replaceAll("action='/", "action='/library/");
}

export function createLibraryHandler({ libraryDir, dataDir, logger = console } = {}) {
  const root = resolve(libraryDir);
  process.env.SITE_URL ||= "https://afarineshshiraz.ir/library";
  process.env.LOCAL_STORE_DIR ||= join(dataDir, "library");
  const modules = new Map();
  const load = async (relative) => {
    if (!modules.has(relative)) modules.set(relative, import(pathToFileURL(join(root, relative)).href));
    return modules.get(relative);
  };
  const reqForModule = (req) => req;

  return async function library(req, res, path) {
    const relativePath = path.slice("/library".length) || "/";
    try {
      const route = ROUTES[relativePath];
      if (route) return (await load(route)).default(reqForModule(req), res);
      if (relativePath === "/" || relativePath === "/index.html") {
        const pageRes = Object.create(res);
        pageRes.end = (body) => res.end(rewriteMountedText(body, ".html"));
        return (await load(ROUTES["/api/home"])).default(reqForModule(req), pageRes);
      }
      let rel = normalize(relativePath).replace(/^([/\\])+/, "");
      if (!rel || rel.endsWith(sep)) rel = join(rel, "index.html");
      let file = resolve(root, rel);
      if (file !== root && !file.startsWith(root + sep)) return send(res, 403, { error: "forbidden" });
      let info = await stat(file).catch(() => null);
      if (!info && !extname(file)) { file += ".html"; info = await stat(file).catch(() => null); }
      if (info?.isDirectory()) { file = join(file, "index.html"); info = await stat(file).catch(() => null); }
      if (!info) return send(res, 404, { error: "not_found" });
      const ext = extname(file);
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": TYPES[ext] || "application/octet-stream", "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600" });
      res.end([".html", ".js", ".css"].includes(ext) ? rewriteMountedText(body.toString("utf8"), ext) : body);
    } catch (error) {
      logger.error?.("library:", error);
      if (!res.headersSent) send(res, 500, { error: "library_unavailable" });
    }
  };
}
