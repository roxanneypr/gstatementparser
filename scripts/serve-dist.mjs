// DEV ONLY: node scripts/serve-dist.mjs [dir=dist] [port=4321]
// Static server for the built site that applies dist/_headers, so the CSP and other security
// headers are enforced exactly like on Cloudflare Pages. Used by the e2e tests.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
const root = process.argv[2] ?? "dist";
const headers = {};
for (const line of readFileSync(join(root, "_headers"), "utf8").split("\n")) {
  const m = /^\s+([\w-]+):\s*(.+)$/.exec(line);
  if (m) headers[m[1]] = m[2];
}
const types = {
  ".png": "image/png",
  ".json": "application/json",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".xml": "application/xml",
  ".txt": "text/plain",
};
createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = join(root, p);
  if (p.endsWith("/")) file = join(file, "index.html");
  // Like Cloudflare Pages: "/blog" serves blog.html even when a blog/ folder also exists.
  else if (existsSync(file + ".html") && (!existsSync(file) || statSync(file).isDirectory())) {
    file += ".html";
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404, { ...headers, "Content-Type": "text/html; charset=utf-8" });
    return res.end(
      existsSync(join(root, "404.html")) ? readFileSync(join(root, "404.html")) : "404",
    );
  }
  res.writeHead(200, {
    ...headers,
    "Content-Type": types[extname(file)] ?? "application/octet-stream",
  });
  res.end(readFileSync(file));
}).listen(Number(process.argv[3] ?? 4321), () => console.log(`Serving ${root} with _headers`));
