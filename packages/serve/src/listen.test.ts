import { spawn } from "node:child_process";
import { once } from "node:events";
import { Agent, request } from "node:http";
import { connect, createServer, type Socket } from "node:net";
import { fileURLToPath } from "node:url";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { listenUntilStopped, start } from "./listen.ts";

const slowServer = fileURLToPath(
  new URL("test/slow-server.ts", import.meta.url),
);

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

/** Whether a new connection to `port` is taken. */
function connects(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      resolve(false);
    });
  });
}

/** The status and `Connection` header of the answer to a GET through `agent`. */
function answerTo(options: {
  port: number;
  path: string;
  agent: Agent;
}): Promise<{ status: number | undefined; connection: string | undefined }> {
  return new Promise((resolve, reject) => {
    request({ host: "127.0.0.1", ...options }, (response) => {
      response.resume();
      response.once("end", () => {
        resolve({
          status: response.statusCode,
          connection: response.headers.connection,
        });
      });
    })
      .once("error", reject)
      .end();
  });
}

/**
 * A connection to `port` that sends nothing, once the server has taken it.
 * A server takes connections in the order they arrive, so once a request
 * on a later one is answered, it has this one.
 */
async function openedSilently(port: number): Promise<Socket> {
  const silent = connect(port, "127.0.0.1");
  await once(silent, "connect");
  await fetch(`http://127.0.0.1:${String(port)}/`, {
    headers: { connection: "close" },
  }).then((answer) => answer.text());
  return silent;
}

/** Resolves once `text` has appeared in what `lines` collected. */
async function printed(lines: string[], text: string): Promise<void> {
  await expect.poll(() => lines.join(""), { timeout: 10_000 }).toContain(text);
}

/** What `console.log` prints from here to the test's end, one entry per call. */
function logged(): () => unknown[] {
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  onTestFinished(() => {
    log.mockRestore();
  });
  return () => log.mock.calls.map(([line]) => line as unknown);
}

/** Options for a server named `test` on `port` that cleans nothing up. */
function on(port: number) {
  return {
    hostname: "127.0.0.1",
    port,
    name: "test",
    onStopped: () => Promise.resolve(),
  };
}

// These run in this process, so the coverage report sees them. Only the
// server a test starts here listens for SIGTERM; the test runner doesn't.
describe("listenUntilStopped in this process", () => {
  it("serves until SIGTERM, then runs onStopped, prints its line and resolves 0", async () => {
    const port = await freePort();
    const lines = logged();
    const onStopped = vi.fn(() => Promise.resolve());

    const served = listenUntilStopped(
      (_request, response) => response.end("hello"),
      { ...on(port), onStopped },
    );
    const listening = `test listening on 127.0.0.1:${String(port)}`;
    await expect.poll(lines).toContain(listening);
    const answer = await fetch(`http://127.0.0.1:${String(port)}/`);
    process.emit("SIGTERM", "SIGTERM");
    // A second signal, such as Ctrl+C reaching the whole process group, is
    // the same request.
    process.emit("SIGINT", "SIGINT");

    expect(await answer.text()).toBe("hello");
    expect(await served).toBe(0);
    expect(onStopped).toHaveBeenCalledOnce();
    expect(lines()).toEqual([listening, "test stopped"]);
    expect(process.listenerCount("SIGTERM")).toBe(0);
  });

  it("answers a request open when SIGTERM arrives, and closes its connection with it", async () => {
    const port = await freePort();
    logged();
    const { promise: released, resolve: release } = Promise.withResolvers();
    const { promise: opened, resolve: open } = Promise.withResolvers();
    const served = listenUntilStopped((_request, response) => {
      open(undefined);
      void released.then(() => response.end("finished"));
    }, on(port));
    await expect.poll(() => connects(port)).toBe(true);
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    onTestFinished(() => {
      agent.destroy();
    });

    const slow = answerTo({ port, path: "/", agent });
    await opened;
    process.emit("SIGTERM", "SIGTERM");
    release(undefined);

    expect(await slow).toEqual({ status: 200, connection: "close" });
    expect(await served).toBe(0);
  });

  // Its headers went out before the signal, so they can't say it. The next
  // request on the connection is answered, and that answer says it.
  it("closes a connection whose answer had begun when SIGTERM arrived with the next answer on it", async () => {
    const port = await freePort();
    logged();
    const { promise: released, resolve: release } = Promise.withResolvers();
    const { promise: begun, resolve: begin } = Promise.withResolvers();
    const served = listenUntilStopped((request, response) => {
      if (request.url !== "/begun") {
        response.end("next");
        return;
      }
      response.writeHead(200).write("started");
      begin(undefined);
      void released.then(() => response.end());
    }, on(port));
    await expect.poll(() => connects(port)).toBe(true);
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    onTestFinished(() => {
      agent.destroy();
    });

    const first = answerTo({ port, path: "/begun", agent });
    await begun;
    process.emit("SIGTERM", "SIGTERM");
    release(undefined);
    const firstAnswer = await first;
    const next = await answerTo({ port, path: "/next", agent });

    expect({ first: firstAnswer, next }).toEqual({
      first: { status: 200, connection: "keep-alive" },
      next: { status: 200, connection: "close" },
    });
    expect(await served).toBe(0);
  });

  it("answers 500 when the app throws or rejects, ends an answer it had begun, and goes on serving", async () => {
    const port = await freePort();
    const lines = logged();
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    onTestFinished(() => {
      errors.mockRestore();
    });
    const fault = new Error("the app broke");
    const served = listenUntilStopped((request, response) => {
      if (request.url === "/throws") throw fault;
      if (request.url === "/rejects") return Promise.reject(fault);
      if (request.url === "/begun") {
        response.writeHead(200).write("part");
        return Promise.reject(fault);
      }
      response.end("fine");
    }, on(port));
    await expect.poll(lines).toHaveLength(1);
    const url = `http://127.0.0.1:${String(port)}`;

    const answers = [];
    for (const path of ["/throws", "/rejects", "/begun", "/"]) {
      const answer = await fetch(url + path);
      answers.push([answer.status, await answer.text()]);
    }
    process.emit("SIGTERM", "SIGTERM");

    expect(answers).toEqual([
      [500, ""],
      [500, ""],
      [200, "part"],
      [200, "fine"],
    ]);
    expect(errors.mock.calls).toEqual([
      ["test couldn't answer GET /throws.", fault],
      ["test couldn't answer GET /rejects.", fault],
      ["test couldn't answer GET /begun.", fault],
    ]);
    expect(await served).toBe(0);
  });

  it("runs onStopped and rejects when its port is taken", async () => {
    const taken = createServer().listen(0, "127.0.0.1");
    await once(taken, "listening");
    onTestFinished(() => {
      taken.close();
    });
    const address = taken.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const onStopped = vi.fn(() => Promise.resolve());

    await expect(
      listenUntilStopped((_request, response) => response.end(), {
        ...on(port),
        onStopped,
      }),
    ).rejects.toThrow(/EADDRINUSE/);
    expect(onStopped).toHaveBeenCalledOnce();
    expect(process.listenerCount("SIGTERM")).toBe(0);
  });
});

describe("start", () => {
  it("takes its signal listeners away when something else closes the server", async () => {
    const port = await freePort();
    const lines = logged();
    const { server } = start((_request, response) => response.end(), on(port));
    await once(server, "listening");

    server.close();
    await once(server, "close");

    expect(process.listenerCount("SIGTERM")).toBe(0);
    expect(process.listenerCount("SIGINT")).toBe(0);
    expect(lines()).toEqual([`test listening on 127.0.0.1:${String(port)}`]);
  });

  it.each([
    [1, "1 connection"],
    [2, "2 connections"],
  ])(
    "closes what is still open once the stop's limit runs out, says so, then stops (%i)",
    async (count, said) => {
      const port = await freePort();
      const lines = logged();
      const { stopped } = start(
        (_request, response) => response.end(),
        on(port),
        50,
      );
      await expect.poll(lines).toHaveLength(1);
      const silent: Socket[] = [];
      for (let i = 0; i < count; i++) silent.push(await openedSilently(port));
      const closed = silent.map((socket) => once(socket, "close"));

      process.emit("SIGTERM", "SIGTERM");

      expect(await stopped).toBe(0);
      await Promise.all(closed);
      expect(lines().slice(1)).toEqual([
        `test closed ${said} still open after 0.05 seconds`,
        "test stopped",
      ]);
    },
  );
});

// Windows has no SIGTERM to send: process.kill there ends the process.
describe.skipIf(process.platform === "win32")("listenUntilStopped", () => {
  it("lets a request open when SIGTERM arrives finish, then prints its line and exits 0", async () => {
    const port = await freePort();
    const server = spawn(process.execPath, [slowServer], {
      env: { ...process.env, PORT: String(port) },
      stdio: ["pipe", "pipe", "inherit"],
    });
    const output: string[] = [];
    server.stdout.on("data", (chunk: Buffer) => output.push(String(chunk)));
    const exited = once(server, "exit");
    const url = `http://127.0.0.1:${String(port)}`;
    await printed(output, `slow listening on 127.0.0.1:${String(port)}`);

    const slow = fetch(`${url}/slow`);
    await printed(output, "slow request open");
    server.kill("SIGTERM");

    // Stopping, it takes no new connection, and the open request goes on.
    await expect
      .poll(() =>
        fetch(`${url}/quick`).then(
          () => "answered",
          () => "refused",
        ),
      )
      .toBe("refused");
    expect(output.join("")).not.toContain("slow stopped");
    server.stdin.end("release\n");
    const response = await slow;

    expect({ status: response.status, body: await response.text() }).toEqual({
      status: 200,
      body: "finished",
    });
    expect(await exited).toEqual([0, null]);
    expect(output.join("")).toContain("slow stopped\n");
  });

  // Node's close() ends only the connections idle at that moment. One that
  // is busy stays open as keep-alive, and Node goes on answering on it, so
  // a proxy with requests to send could hold the server open until Docker
  // kills it.
  it("ends a connection that was busy when SIGTERM arrived, once its answer is sent", async () => {
    const port = await freePort();
    const server = spawn(process.execPath, [slowServer], {
      env: { ...process.env, PORT: String(port) },
      stdio: ["pipe", "pipe", "inherit"],
    });
    const output: string[] = [];
    server.stdout.on("data", (chunk: Buffer) => output.push(String(chunk)));
    await printed(output, `slow listening on 127.0.0.1:${String(port)}`);
    // One connection, kept open between requests, as a proxy keeps its own.
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    try {
      const slow = answerTo({ port, path: "/slow", agent });
      await printed(output, "slow request open");
      server.kill("SIGTERM");
      await expect.poll(() => connects(port)).toBe(false);
      server.stdin.end("release\n");

      expect(await slow).toEqual({ status: 200, connection: "close" });
      // The client hasn't let go of its side. The server doesn't wait.
      await expect.poll(() => server.exitCode, { timeout: 2_000 }).toBe(0);
    } finally {
      agent.destroy();
      server.kill("SIGKILL");
    }
  });

  // A connection that has sent nothing holds Node's close() open: it isn't
  // idle to closeIdleConnections(), and close() stops the timer that would
  // have ended it.
  it("doesn't let a connection that has sent nothing hold it past the stop's limit", async () => {
    const port = await freePort();
    const server = spawn(process.execPath, [slowServer], {
      env: { ...process.env, PORT: String(port) },
      stdio: ["pipe", "pipe", "inherit"],
    });
    const output: string[] = [];
    server.stdout.on("data", (chunk: Buffer) => output.push(String(chunk)));
    const exited = once(server, "exit");
    await printed(output, `slow listening on 127.0.0.1:${String(port)}`);
    const silent = await openedSilently(port);
    try {
      const signalled = performance.now();
      server.kill("SIGTERM");
      const [code] = (await exited) as [number | null];
      const took = performance.now() - signalled;

      expect({ code, end: output.join("").split("\n").slice(-3) }).toEqual({
        code: 0,
        end: [
          "slow closed 1 connection still open after 8 seconds",
          "slow stopped",
          "",
        ],
      });
      // Docker kills the container at 10 seconds.
      expect(took).toBeLessThan(9000);
    } finally {
      silent.destroy();
      server.kill("SIGKILL");
    }
  }, 15_000);
});
