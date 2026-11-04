import { execFile } from "node:child_process";
import { once } from "node:events";
import { readdir, readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const npm = "https://registry.npmjs.org";

/** An npm registry on 127.0.0.1 that serves a folder of packed packages. */
export interface FakeRegistry {
  /** Its origin, such as `http://127.0.0.1:4873`. */
  readonly url: string;
  close(): Promise<void>;
}

interface Packed {
  manifest: { name: string; version: string };
  file: string;
}

/** npm's path to a version's tarball, such as `@robkit/core/-/core-0.0.0.tgz`. */
function tarballPath({ name, version }: Packed["manifest"]): string {
  return `${name}/-/${name.split("/").pop() ?? name}-${version}.tgz`;
}

/**
 * Serves every tarball in `dir` as the one version of its package, as npm
 * would once robkit's packages are published, and every other package
 * from npm. Each packed version reads as published long ago, so a package
 * manager's minimum release age lets it through.
 */
export async function serveTarballs(dir: string): Promise<FakeRegistry> {
  const packed = new Map<string, Packed>();
  for (const file of await readdir(dir)) {
    if (!file.endsWith(".tgz")) continue;
    const { stdout } = await run("tar", [
      "-xzOf",
      join(dir, file),
      "package/package.json",
    ]);
    const manifest = JSON.parse(stdout) as Packed["manifest"];
    packed.set(manifest.name, { manifest, file });
  }

  const server: Server = createServer((request, response) => {
    void (async () => {
      const path = decodeURIComponent(request.url ?? "/").slice(1);
      const tarball = /^(.+)\/-\/[^/]+\.tgz$/.exec(path);
      const entry = packed.get(tarball?.[1] ?? path);
      if (tarball !== null && entry !== undefined) {
        response.writeHead(200, { "content-type": "application/octet-stream" });
        return response.end(await readFile(join(dir, entry.file)));
      }
      if (entry === undefined) {
        // Every other package comes from npm, as it would beside them.
        const upstream = await fetch(`${npm}${request.url ?? "/"}`, {
          headers: { accept: request.headers.accept ?? "application/json" },
        });
        const type = upstream.headers.get("content-type") ?? "application/json";
        response.writeHead(upstream.status, { "content-type": type });
        if (!type.includes("json")) {
          return response.end(Buffer.from(await upstream.arrayBuffer()));
        }
        // Its tarballs come through here too, as they would from npm, so a
        // lockfile records no URL for them either.
        return response.end(
          (await upstream.text()).replaceAll(`${npm}/`, `${url}/`),
        );
      }
      const { manifest } = entry;
      const published = "2020-01-01T00:00:00.000Z";
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          name: manifest.name,
          "dist-tags": { latest: manifest.version },
          versions: {
            [manifest.version]: {
              ...manifest,
              // Where npm keeps a tarball, so a lockfile records no URL
              // and installs from any registry that serves the package.
              dist: { tarball: `${url}/${tarballPath(manifest)}` },
            },
          },
          time: {
            created: published,
            modified: published,
            [manifest.version]: published,
          },
        }),
      );
    })();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${String(port)}`;
  return {
    url,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
