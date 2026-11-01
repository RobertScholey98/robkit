import { execFile, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { request, type IncomingHttpHeaders } from "node:http";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { freePort, freePortBlock } from "@internal/test-postgres";
import { discoverApps } from "@robkit/dev";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const run = promisify(execFile);
const root = fileURLToPath(new URL("../../../", import.meta.url));

interface Reply {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

let dev: ChildProcess;
let devPort: number;
let output = "";
const project = `robkit-e2e-${String(process.pid)}`;

function get(
  host: string,
  path = "/",
  headers: Record<string, string> = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    request(
      { host: "127.0.0.1", port: devPort, path, headers: { host, ...headers } },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => (body += chunk.toString()));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
        });
      },
    )
      .on("error", reject)
      .end();
  });
}

async function eventually(attempt: () => Promise<Reply>): Promise<Reply> {
  const deadline = Date.now() + 120_000;
  for (;;) {
    const reply = await attempt().catch(() => undefined);
    if (reply?.status === 200) return reply;
    if (Date.now() > deadline) {
      throw new Error(`the stack never came up:\n${output}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

function isListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1");
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      resolve(false);
    });
  });
}

beforeAll(async () => {
  devPort = await freePortBlock(1 + (await discoverApps(root)).length);
  dev = spawn("pnpm", ["dev"], {
    cwd: root,
    env: {
      ...process.env,
      ROBKIT_DEV_PORT: String(devPort),
      ROBKIT_POSTGRES_PORT: String(await freePort()),
      COMPOSE_PROJECT_NAME: project,
    },
    // Its own process group, like a terminal's foreground job, so SIGINT
    // below reaches it the way Ctrl-C would.
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  dev.stdout?.on("data", (chunk: Buffer) => (output += chunk.toString()));
  dev.stderr?.on("data", (chunk: Buffer) => (output += chunk.toString()));
});

afterAll(async () => {
  if (dev.exitCode === null && dev.pid) process.kill(-dev.pid, "SIGKILL");
  await run("docker", ["compose", "-p", project, "down", "-v"], { cwd: root });
});

describe("pnpm dev", () => {
  it("serves the hub on hub.localhost", async () => {
    const hub = await eventually(() => get(`hub.localhost:${String(devPort)}`));

    expect(hub.headers["content-type"]).toMatch(/text\/html/);
    expect(hub.body).toContain('<div id="root">');
  });

  it("serves core on core.localhost, open to the hub", async () => {
    const hubOrigin = `http://hub.localhost:${String(devPort)}`;

    const status = await eventually(() =>
      get(`core.localhost:${String(devPort)}`, "/status", {
        origin: hubOrigin,
      }),
    );

    expect(JSON.parse(status.body)).toEqual({ status: "ok" });
    expect(status.headers["access-control-allow-origin"]).toBe(hubOrigin);
  });

  it("stops every app and Postgres on Ctrl-C", async () => {
    const apps = await discoverApps(root, devPort + 1);
    if (!dev.pid) throw new Error("pnpm dev never started");

    process.kill(-dev.pid, "SIGINT");
    const [code] = (await once(dev, "exit")) as [number | null];

    expect(code).toBe(0);
    for (const port of [devPort, ...apps.map((app) => app.port)]) {
      expect(await isListening(port)).toBe(false);
    }
    const running = await run(
      "docker",
      ["compose", "-p", project, "ps", "-q"],
      {
        cwd: root,
      },
    );
    expect(running.stdout.trim()).toBe("");
  });
});
