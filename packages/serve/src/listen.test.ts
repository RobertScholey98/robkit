import { spawn } from "node:child_process";
import { once } from "node:events";
import { Agent, request } from "node:http";
import { connect, createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { listenUntilStopped } from "./listen.ts";

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

// These run in this process, so the coverage report sees them. Only the
// server a test starts here listens for SIGTERM; the test runner doesn't.
describe("listenUntilStopped in this process", () => {
  it("serves until SIGTERM, then runs onStopped, prints its line and resolves 0", async () => {
    const port = await freePort();
    const lines = logged();
    const onStopped = vi.fn(() => Promise.resolve());

    const served = listenUntilStopped({
      fetch: () => new Response("hello"),
      hostname: "127.0.0.1",
      port,
      name: "test",
      onStopped,
    });
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
    const served = listenUntilStopped({
      fetch: async () => {
        open(undefined);
        await released;
        return new Response("finished");
      },
      hostname: "127.0.0.1",
      port,
      name: "test",
      onStopped: () => Promise.resolve(),
    });
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
      listenUntilStopped({
        fetch: () => new Response("hello"),
        hostname: "127.0.0.1",
        port,
        name: "test",
        onStopped,
      }),
    ).rejects.toThrow(/EADDRINUSE/);
    expect(onStopped).toHaveBeenCalledOnce();
    expect(process.listenerCount("SIGTERM")).toBe(0);
  });
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
});
