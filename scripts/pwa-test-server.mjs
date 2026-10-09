// Serve a copy of the production build under the same path used by GitHub Pages.
// Keeping the copy separate lets the update test change a worker without editing dist.
import { createServer } from "node:http";
import { cp, mkdir, readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve(".local/pwa-site/Implantation-WS");
await mkdir(root, { recursive: true });
await cp("dist", root, { recursive: true });
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1:5176");
    if (url.pathname === "/Implantation-WS") {
      res.writeHead(301, { Location: "/Implantation-WS/" });
      res.end();
      return;
    }
    if (!url.pathname.startsWith("/Implantation-WS/")) {
      res.writeHead(404);
      res.end();
      return;
    }
    const relative =
      decodeURIComponent(url.pathname.slice("/Implantation-WS/".length)) ||
      "index.html";
    const path = resolve(root, relative);
    if (!path.startsWith(root + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const file = await readFile(path);
    res.writeHead(200, {
      "Content-Type": types[extname(path)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(5176, "127.0.0.1", () =>
  console.log("PWA production test server ready."),
);
