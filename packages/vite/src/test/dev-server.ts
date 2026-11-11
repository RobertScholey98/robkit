import { request } from "node:http";
import { createServer as createNetServer } from "node:net";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { onTestFinished, vi } from "vitest";
import {
  createServer,
  type PluginOption,
  type ServerOptions,
  type ViteDevServer,
} from "vite";

/**
 * Stubs what `pnpm dev` hands an app, on the install `robkit.test`, with
 * `overrides` on top. `undefined` takes a variable away.
 */
export function settings(overrides: Record<string, string | undefined>): void {
  const env: Record<string, string | undefined> = {
    ROBKIT_APP: "notes",
    ROBKIT_CORE_URL: "https://core.robkit.test",
    ROBKIT_DOMAIN: "robkit.test",
    ...overrides,
  };
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
}

/** A port nothing listens on now. */
export async function freePort(): Promise<number> {
  const server = createNetServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  server.close();
  await once(server, "close");
  if (typeof address !== "object" || !address) {
    throw new Error(`The test server has no port: ${String(address)}`);
  }
  return address.port;
}

/**
 * A folder with an `index.html`, and `files` at their paths in it, removed
 * after the test.
 */
export async function appFolder(
  files: Record<string, string> = {},
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "robkit-vite-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "index.html"), "<p>the page</p>\n");
  for (const [name, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), text);
  }
  return root;
}

/**
 * A Vite dev server with `plugins`, listening, on a folder of its own,
 * closed after the test.
 */
export async function devServer(
  plugins: PluginOption[],
  server: ServerOptions = {},
  root?: string,
): Promise<ViteDevServer> {
  const vite = await createServer({
    root: root ?? (await appFolder()),
    configFile: false,
    logLevel: "silent",
    plugins,
    server,
  });
  onTestFinished(() => vite.close());
  await vite.listen();
  return vite;
}

export interface Answer {
  status: number;
  headers: Headers;
  body: string;
}

/** What the server on `port` answers `GET path` with, asked for `host`. */
export function answer(
  port: number,
  host: string,
  path = "/",
): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: "127.0.0.1", port, path, headers: { host }, timeout: 10_000 },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const headers = new Headers();
          for (const [name, value] of Object.entries(res.headers)) {
            if (typeof value === "string") headers.set(name, value);
          }
          resolve({
            status: res.statusCode ?? 0,
            headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error(`GET ${path} on port ${String(port)} timed out`));
    });
    req.on("error", reject);
    req.end();
  });
}
