// A static server over the built site, for the browser tests. It answers a
// folder's address with its index.html, as a static host does, and a
// missing path with 404.html when the site has one.

import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, sep } from "node:path";

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".xml": "application/xml",
};

const isFile = async (path: string) =>
  stat(path).then(
    (found) => found.isFile(),
    () => false,
  );

/** Serves `root` on a free port of 127.0.0.1 until `close` is called. */
export async function serveSite(
  root: string,
): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    void (async () => {
      const path = decodeURIComponent(
        new URL(request.url ?? "/", "http://site").pathname,
      );
      let file = normalize(join(root, path));
      if (!file.startsWith(root + sep) && file !== root) {
        response.writeHead(400).end();
        return;
      }
      if (path.endsWith("/")) file = join(file, "index.html");
      else if (await isFile(join(file, "index.html"))) {
        response.writeHead(301, { location: `${path}/` }).end();
        return;
      }
      if (await isFile(file)) {
        response.writeHead(200, {
          "content-type": types[extname(file)] ?? "application/octet-stream",
        });
        response.end(await readFile(file));
        return;
      }
      const missing = join(root, "404.html");
      response.writeHead(404, { "content-type": types[".html"] });
      response.end((await isFile(missing)) ? await readFile(missing) : "");
    })();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${String(port)}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
