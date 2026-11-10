// For the adapters' tests of their `/serve` entries: a built app's folder,
// the server started in it, and what it answers at a path sent as written.
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request, type Server } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { onTestFinished, vi } from "vitest";
import { listeningPort } from "./known.ts";

/**
 * A new folder holding each of `files` at its path, such as
 * `dist/assets/page.css`, removed once the test ends.
 */
export async function builtApp(files: Record<string, string>): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "robkit-built-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(folder, path)), { recursive: true });
    await writeFile(join(folder, path), text);
  }
  return folder;
}

/** What a server answered: its status, two headers and the body. */
export interface Answered {
  status: number | undefined;
  type: string | null;
  sniff: string | null;
  body: string;
}

/**
 * What the server on `port` answers at `path`, sent as written: Node's
 * client doesn't tidy away a `..` as a browser or `fetch` does.
 */
export function answerAt(
  port: number,
  path: string,
  method = "GET",
): Promise<Answered> {
  return new Promise((resolve, reject) => {
    request({ host: "127.0.0.1", port, path, method }, (response) => {
      let body = "";
      response.setEncoding("utf8").on("data", (chunk: string) => {
        body += chunk;
      });
      response.once("end", () => {
        const header = (name: string) => {
          const value = response.headers[name];
          return value === undefined ? null : String(value);
        };
        resolve({
          status: response.statusCode,
          type: header("content-type"),
          sniff: header("x-content-type-options"),
          body,
        });
      });
    })
      .once("error", reject)
      .end();
  });
}

/**
 * Starts `serve` as if from `folder`, the app's own, on a free port it
 * reads from `PORT`, with its lines kept from the test's output. Resolves
 * once it listens, and closes it once the test ends.
 */
export async function serving(
  folder: string,
  serve: () => Server | Promise<Server>,
): Promise<{ server: Server; port: number }> {
  const probe = createServer().listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = listeningPort(probe);
  probe.close();
  vi.stubEnv("PORT", String(port));
  vi.stubEnv("HOST", "127.0.0.1");
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(folder);
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  try {
    const server = await serve();
    onTestFinished(async () => {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    });
    if (!server.listening) await once(server, "listening");
    return { server, port };
  } finally {
    vi.unstubAllEnvs();
    cwd.mockRestore();
    log.mockRestore();
  }
}
