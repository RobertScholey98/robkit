import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request, type Server } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest";
import { servePage } from "./page.ts";

/** A port nothing listens on. */
async function freePort(): Promise<number> {
  const server = createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  server.close();
  if (address === null || typeof address === "string") {
    throw new Error("The probe server has no port.");
  }
  return address.port;
}

/** What `port` answers at `path`, sent as written, with the headers named. */
function answerAt(
  port: number,
  path: string,
  method = "GET",
): Promise<{
  status: number | undefined;
  type: string | undefined;
  body: string;
  headers: Record<string, string | undefined>;
}> {
  return new Promise((resolve, reject) => {
    request({ host: "127.0.0.1", port, path, method }, (response) => {
      let body = "";
      response.setEncoding("utf8").on("data", (chunk: string) => {
        body += chunk;
      });
      response.once("end", () => {
        const header = (name: string) => {
          const value = response.headers[name];
          return value === undefined ? undefined : String(value);
        };
        resolve({
          status: response.statusCode,
          type: header("content-type"),
          body,
          headers: {
            frame: header("x-frame-options"),
            policy: header("content-security-policy"),
            sniff: header("x-content-type-options"),
            hsts: header("strict-transport-security"),
          },
        });
      });
    })
      .once("error", reject)
      .end();
  });
}

/** Stands in for process.exit, so a test can see the code. */
function exits() {
  const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const exit = vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("exited");
  });
  onTestFinished(() => {
    errors.mockRestore();
    exit.mockRestore();
  });
  return { errors, exit };
}

// What vite build writes for the hub, and a file beside it that isn't
// the page's.
let dir: string;
let dist: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "robkit-page-"));
  dist = join(dir, "dist");
  await mkdir(join(dist, "assets"), { recursive: true });
  await writeFile(join(dist, "index.html"), "<p>the page</p>");
  await writeFile(join(dist, "assets/main.js"), "export {};");
  await writeFile(join(dir, "secret.txt"), "not the page's");
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Serves the page with `env` set, on a fresh port. */
async function served(env: Record<string, string> = {}): Promise<number> {
  const port = await freePort();
  vi.stubEnv("ROBKIT_CORE_URL", "");
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const server: Server = servePage({
    folder: dist,
    address: { host: "127.0.0.1", port },
  });
  onTestFinished(async () => {
    vi.unstubAllEnvs();
    log.mockRestore();
    server.closeAllConnections();
    server.close();
    await once(server, "close");
  });
  await once(server, "listening");
  return port;
}

/** The hub's three headers, as robkit() sends them in dev. */
const hubHeaders = {
  frame: "DENY",
  policy: "frame-ancestors 'none'",
  sniff: "nosniff",
  hsts: undefined,
};

describe("servePage", () => {
  it("answers each file vite build wrote, with its type and the hub's headers", async () => {
    const port = await served();

    expect(await answerAt(port, "/assets/main.js")).toEqual({
      status: 200,
      type: "text/javascript; charset=utf-8",
      body: "export {};",
      headers: hubHeaders,
    });
  });

  it.each(["/", "/i/ABCDE", "/assets/missing.js", "/%2e%2e/secret.txt"])(
    "answers the page at %s",
    async (path) => {
      const port = await served();

      expect(await answerAt(port, path)).toEqual({
        status: 200,
        type: "text/html; charset=utf-8",
        body: "<p>the page</p>",
        headers: hubHeaders,
      });
    },
  );

  it("answers 404 to a request that isn't a GET or HEAD", async () => {
    const port = await served();

    const { status, headers } = await answerAt(port, "/", "POST");

    expect({ status, headers }).toEqual({ status: 404, headers: hubHeaders });
  });

  it("sends HSTS too when core's address is https", async () => {
    const port = await served({ ROBKIT_CORE_URL: "https://core.robkit.dev" });

    expect((await answerAt(port, "/")).headers).toEqual({
      ...hubHeaders,
      hsts: "max-age=31536000",
    });
  });

  it("refuses a malformed ROBKIT_CORE_URL with the reader's message, and exits 1", () => {
    vi.stubEnv("ROBKIT_CORE_URL", "http://core.robkit.dev");
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });
    const { errors, exit } = exits();

    expect(() => servePage({ folder: dist })).toThrow("exited");
    expect(exit).toHaveBeenCalledWith(1);
    expect(errors.mock.calls).toEqual([
      [
        `ROBKIT_CORE_URL is "http://core.robkit.dev", which is http on a domain that isn't local. Serve the install over https and set it to https://core.robkit.dev.`,
      ],
    ]);
  });

  it("answers 500 when the page has gone since it started", async () => {
    const gone = await mkdtemp(join(tmpdir(), "robkit-page-gone-"));
    onTestFinished(() => rm(gone, { recursive: true, force: true }));
    await writeFile(join(gone, "index.html"), "<p>the page</p>");
    const port = await freePort();
    const { errors } = exits();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const server = servePage({
      folder: gone,
      address: { host: "127.0.0.1", port },
    });
    onTestFinished(async () => {
      vi.restoreAllMocks();
      server.close();
      await once(server, "close");
    });
    await once(server, "listening");
    await rm(join(gone, "index.html"));

    const { status } = await answerAt(port, "/");

    expect(status).toBe(500);
    expect(errors.mock.calls).toEqual([
      [
        "server couldn't answer GET /.",
        new Error(`serve-static couldn't send ${join(gone, "index.html")}.`),
      ],
    ]);
  });

  it("refuses to start without the page, saying to build it", () => {
    const { errors, exit } = exits();

    expect(() => servePage({ folder: dir })).toThrow("exited");
    expect(exit).toHaveBeenCalledWith(1);
    expect(errors.mock.calls).toEqual([
      [
        `${join(dir, "index.html")} isn't there. Run the app's build, pnpm build, before it serves.`,
      ],
    ]);
  });
});
