import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import {
  request,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
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
import { serve } from "./serve.ts";

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

interface Answer {
  status: number | undefined;
  type: string | undefined;
  sniff: string | undefined;
  body: string;
}

/**
 * What `port` answers at `path`, sent as written: Node's client doesn't
 * tidy away a `..` as a browser or `fetch` does.
 */
function answerAt(
  port: number,
  path: string,
  options: { method?: string; headers?: Record<string, string> } = {},
): Promise<
  Answer & { etag: string | undefined; contentRange: string | undefined }
> {
  return new Promise((resolve, reject) => {
    request({ host: "127.0.0.1", port, path, ...options }, (response) => {
      let body = "";
      response.setEncoding("utf8").on("data", (chunk: string) => {
        body += chunk;
      });
      response.once("end", () => {
        resolve({
          status: response.statusCode,
          type: response.headers["content-type"],
          sniff: String(response.headers["x-content-type-options"]),
          etag: response.headers.etag,
          contentRange: response.headers["content-range"],
          body,
        });
      });
    })
      .once("error", reject)
      .end();
  });
}

/** Leaves out the ETag, which changes with each file's time. */
async function answer(
  port: number,
  path: string,
  options?: { method?: string },
): Promise<Answer> {
  const { status, type, sniff, body } = await answerAt(port, path, options);
  return { status, type, sniff, body };
}

/** What `console.log` prints from here to the test's end, one entry per call. */
function logged(): () => unknown[] {
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  onTestFinished(() => {
    log.mockRestore();
  });
  return () => log.mock.calls.map(([line]) => line as unknown);
}

/** Closes `server` once the test ends. */
function closeAfter(server: Server): Server {
  onTestFinished(async () => {
    server.closeAllConnections();
    server.close();
    await once(server, "close");
  });
  return server;
}

/** An app that answers every request it is handed with 404 and its path. */
function app(request: IncomingMessage, response: ServerResponse) {
  response.writeHead(404).end(`app: ${String(request.url)}`);
}

// A react-hono build: the server's bundle beside the client's files, and
// the app's own public folder.
let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "robkit-serve-"));
  await mkdir(join(dir, "dist/assets"), { recursive: true });
  await mkdir(join(dir, "public"));
  await writeFile(join(dir, "dist/serve.js"), "the server's bundle");
  await writeFile(join(dir, "dist/assets/page.css"), "body {}");
  await writeFile(join(dir, "dist/assets/page.js"), "export {};");
  await writeFile(join(dir, "dist/assets/.hidden"), "a dotfile");
  await writeFile(join(dir, "public/robots.txt"), "User-agent: *");
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Serves `app` with the build's client files and public folder on a fresh port. */
async function served(): Promise<number> {
  const port = await freePort();
  vi.stubEnv("PORT", String(port));
  vi.stubEnv("HOST", "");
  onTestFinished(() => {
    vi.unstubAllEnvs();
  });
  const lines = logged();
  closeAfter(
    serve(app, {
      files: [
        { at: "/assets", folder: join(dir, "dist/assets") },
        { at: "/", folder: join(dir, "public") },
      ],
    }),
  );
  await expect.poll(lines).toHaveLength(1);
  return port;
}

describe("serve", () => {
  it("listens on HOST and PORT, says so, and gives back the server", async () => {
    const port = await freePort();
    vi.stubEnv("PORT", String(port));
    vi.stubEnv("HOST", "127.0.0.1");
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });
    const lines = logged();

    const server = closeAfter(serve(app, { name: "notes" }));
    await once(server, "listening");

    expect(server.address()).toMatchObject({ address: "127.0.0.1", port });
    expect(lines()).toEqual([`notes listening on 127.0.0.1:${String(port)}`]);
  });

  it("answers a stylesheet and a script from their folder with their types and nosniff", async () => {
    const port = await served();

    expect([
      await answer(port, "/assets/page.css"),
      await answer(port, "/assets/page.js"),
    ]).toEqual([
      {
        status: 200,
        type: "text/css; charset=utf-8",
        sniff: "nosniff",
        body: "body {}",
      },
      {
        status: 200,
        type: "text/javascript; charset=utf-8",
        sniff: "nosniff",
        body: "export {};",
      },
    ]);
  });

  it("answers 304 to a request for a file the browser already holds", async () => {
    const port = await served();
    const { etag } = await answerAt(port, "/assets/page.css");

    const again = await answerAt(port, "/assets/page.css", {
      headers: { "if-none-match": String(etag) },
    });

    expect({ status: again.status, body: again.body }).toEqual({
      status: 304,
      body: "",
    });
  });

  // serve-static hands both on as errors, once it has found the file. Neither
  // is a fault in the app, so neither is a 500 or a line in its log.
  it("answers 416 to a range the file doesn't have, and 412 to a precondition that fails", async () => {
    const port = await served();
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    onTestFinished(() => {
      errors.mockRestore();
    });

    const range = await answerAt(port, "/assets/page.css", {
      headers: { range: "bytes=100-" },
    });
    const held = await answerAt(port, "/assets/page.css", {
      headers: { "if-match": '"another"' },
    });

    // Each still says which version of the file the server has.
    const etag: unknown = expect.any(String);
    expect([range, held]).toEqual([
      {
        status: 416,
        type: undefined,
        sniff: "nosniff",
        etag,
        contentRange: "bytes */7",
        body: "",
      },
      {
        status: 412,
        type: undefined,
        sniff: "nosniff",
        etag,
        contentRange: undefined,
        body: "",
      },
    ]);
    expect(errors).not.toHaveBeenCalled();
  });

  it("answers a file in the public folder at the root", async () => {
    const port = await served();

    expect(await answer(port, "/robots.txt")).toEqual({
      status: 200,
      type: "text/plain; charset=utf-8",
      sniff: "nosniff",
      body: "User-agent: *",
    });
  });

  it("hands the app every other request, with nosniff", async () => {
    const port = await served();

    expect([
      await answer(port, "/notes"),
      await answer(port, "/assets/missing.css"),
      await answer(port, "/assets/page.css", { method: "POST" }),
    ]).toEqual([
      { status: 404, type: undefined, sniff: "nosniff", body: "app: /notes" },
      {
        status: 404,
        type: undefined,
        sniff: "nosniff",
        body: "app: /assets/missing.css",
      },
      {
        status: 404,
        type: undefined,
        sniff: "nosniff",
        body: "app: /assets/page.css",
      },
    ]);
  });

  // dist holds the server's own bundle beside the client's files.
  it.each([
    "/serve.js",
    "/assets/../serve.js",
    "/assets/..%2fserve.js",
    "/assets/%2e%2e/serve.js",
    "/assets/%2e%2e%2fserve.js",
    "/../dist/serve.js",
    "/%2e%2e/dist/serve.js",
    "/assets/.hidden",
    "/assets",
    "/assets/",
  ])("never answers %s with a file, and hands it to the app", async (path) => {
    const port = await served();

    const { status, body } = await answer(port, path);

    expect({ status, body }).toEqual({ status: 404, body: `app: ${path}` });
  });

  it("refuses a malformed PORT with the reader's message, and exits 1", () => {
    vi.stubEnv("PORT", "web");
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });
    onTestFinished(() => {
      errors.mockRestore();
      exit.mockRestore();
    });

    expect(() => serve(app)).toThrow("exited");
    expect(exit).toHaveBeenCalledWith(1);
    expect(errors.mock.calls).toEqual([
      [
        `PORT is "web", which isn't a port. Set it to a whole number from 1 to 65535, or leave it unset for 3000.`,
      ],
    ]);
  });

  it("exits 0 once SIGTERM has stopped it", async () => {
    const port = await freePort();
    const lines = logged();
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    onTestFinished(() => {
      exit.mockRestore();
    });
    const server = serve(app, { address: { host: "127.0.0.1", port } });
    await once(server, "listening");

    process.emit("SIGTERM", "SIGTERM");

    await expect.poll(() => exit.mock.calls).toEqual([[0]]);
    expect(lines()).toEqual([
      `server listening on 127.0.0.1:${String(port)}`,
      "server stopped",
    ]);
  });

  it("says it can't listen, and exits 1, when its port is taken", async () => {
    const taken = createServer().listen(0, "127.0.0.1");
    await once(taken, "listening");
    onTestFinished(() => {
      taken.close();
    });
    const address = taken.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    onTestFinished(() => {
      errors.mockRestore();
      exit.mockRestore();
    });

    serve(app, { address: { host: "127.0.0.1", port } });

    await expect.poll(() => exit.mock.calls).toEqual([[1]]);
    expect(errors.mock.calls).toEqual([
      [
        `server couldn't listen on 127.0.0.1:${String(port)}.`,
        expect.objectContaining({ code: "EADDRINUSE" }),
      ],
    ]);
  });
});
