import { execFile, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { request, type IncomingHttpHeaders } from "node:http";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { freePort, freePortBlock } from "@internal/test-postgres";
import { discoverApps } from "@robkit/dev";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guestJourney } from "./guest-journey.ts";
import { ownerJourney } from "./owner-journey.ts";
import { roleJourney } from "./role-journey.ts";
import { serverFunctionJourney } from "./server-function-journey.ts";

const run = promisify(execFile);
const root = fileURLToPath(new URL("../../../", import.meta.url));

interface Reply {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

let dev: ChildProcess;
let devPort: number;
let postgresPort: number;
let output = "";
const project = `robkit-e2e-${String(process.pid)}`;

function send(
  host: string,
  path: string,
  {
    method = "GET",
    headers = {},
    body,
  }: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    request(
      {
        host: "127.0.0.1",
        port: devPort,
        method,
        path,
        headers: { host, ...headers },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => (body += chunk.toString()));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
        });
      },
    )
      .on("error", reject)
      .end(body);
  });
}

function get(
  host: string,
  path = "/",
  headers: Record<string, string> = {},
): Promise<Reply> {
  return send(host, path, { headers });
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
  postgresPort = await freePort();
  dev = spawn("pnpm", ["dev"], {
    cwd: root,
    env: {
      ...process.env,
      ROBKIT_DEV_PORT: String(devPort),
      ROBKIT_POSTGRES_PORT: String(postgresPort),
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
  it("serves the hub on hub.robkit.localhost", async () => {
    const hub = await eventually(() =>
      get(`hub.robkit.localhost:${String(devPort)}`),
    );

    expect(hub.headers["content-type"]).toMatch(/text\/html/);
    expect(hub.body).toContain('<div id="root">');
  });

  it("serves core on core.robkit.localhost, open to the hub", async () => {
    const hubOrigin = `http://hub.robkit.localhost:${String(devPort)}`;

    const status = await eventually(() =>
      get(`core.robkit.localhost:${String(devPort)}`, "/status", {
        origin: hubOrigin,
      }),
    );

    expect(JSON.parse(status.body)).toEqual({ status: "ok" });
    expect(status.headers["access-control-allow-origin"]).toBe(hubOrigin);
  });

  it("lets the owner claim the install and stay signed in", async () => {
    const core = `core.robkit.localhost:${String(devPort)}`;
    const origin = `http://hub.robkit.localhost:${String(devPort)}`;

    const before = await get(core, "/session", { origin });
    const setup = await send(core, "/setup", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        username: "rob",
        password: "correct horse battery",
      }),
    });
    const [cookie = ""] = setup.headers["set-cookie"] ?? [];
    const after = await get(core, "/session", {
      origin,
      cookie: cookie.split(";")[0] ?? "",
    });

    expect(JSON.parse(before.body)).toEqual({ state: "unclaimed" });
    expect(setup.status).toBe(201);
    expect(cookie).toMatch(/^robkit_session=[\w-]+\.[\w-]+\.[\w-]+;/);
    expect(cookie).toContain("; Domain=robkit.localhost;");
    expect(cookie).not.toContain("Secure");
    expect(JSON.parse(after.body)).toEqual({
      state: "signed-in",
      viewer: {
        kind: "owner",
        id: (JSON.parse(setup.body) as { viewer: { id: string } }).viewer.id,
        username: "rob",
      },
    });
  });

  // example is the Hono app, and start the TanStack Start one.
  it.each(["example", "start"])(
    "guards the %s app: login, return and refresh bounce",
    async (app) => {
      const at = (slug: string, path = "/") =>
        `http://${slug}.robkit.localhost:${String(devPort)}${path}`;
      const example = at(app);

      const journey = await ownerJourney(
        {
          devPort,
          adminUrl: `postgres://postgres:postgres@127.0.0.1:${String(postgresPort)}/robkit`,
          username: "rob",
          password: "correct horse battery",
        },
        app,
      );

      expect(journey).toEqual({
        signedOutAt: at("hub", `/?next=${encodeURIComponent(example)}`),
        signedInAt: example,
        heading: "Signed in as the owner",
        viewerId: journey.ownerId,
        ownerId: expect.stringMatching(/^[0-9a-f-]{36}$/) as string,
        bounce: [
          example,
          at("core", `/refresh?next=${encodeURIComponent(example)}`),
          example,
        ],
        bouncedTo: example,
        bouncedViewerId: journey.ownerId,
      });
    },
  );

  it("sends a server function call with an expired session through core's refresh", async () => {
    const at = (slug: string, path = "/") =>
      `http://${slug}.robkit.localhost:${String(devPort)}${path}`;
    const example = at("start");

    const journey = await serverFunctionJourney({
      devPort,
      adminUrl: `postgres://postgres:postgres@127.0.0.1:${String(postgresPort)}/robkit`,
      username: "rob",
      password: "correct horse battery",
    });

    const [first] = journey.visits;
    expect(journey).toEqual({
      visits: [first, first + 1],
      bounce: [
        at("core", `/refresh?next=${encodeURIComponent(example)}`),
        example,
      ],
      bouncedTo: example,
      // The expired call recorded nothing. The page load after it did.
      visitsAfterBounce: first + 2,
    });
  });

  it("signs guests in with codes, keeps them out of owner-only apps, and ends a revoked code's session", async () => {
    const at = (slug: string, path = "/") =>
      `http://${slug}.robkit.localhost:${String(devPort)}${path}`;
    const example = at("example");
    const notFound = { status: 404, body: "Not found" };

    const journey = await guestJourney({
      devPort,
      adminUrl: `postgres://postgres:postgres@127.0.0.1:${String(postgresPort)}/robkit`,
      username: "rob",
      password: "correct horse battery",
    });

    expect(journey).toEqual({
      code: expect.stringMatching(
        /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/,
      ) as string,
      introLink: at("hub", `/i/${journey.code ?? ""}`),
      introLandedAt: at("hub"),
      introGreeting: "Signed in as Grandma",
      admin: notFound,
      example: notFound,
      startExample: notFound,
      testCodeGreeting: "Signed in as Test",
      revokedStanding: "Revoked",
      bounce: [
        example,
        at("core", `/refresh?next=${encodeURIComponent(example)}`),
        example,
        at("hub", `/?next=${encodeURIComponent(example)}`),
      ],
      afterRevokeAt: at("hub", `/?next=${encodeURIComponent(example)}`),
    });
  });

  // The example app keeps its rule for a minute, and this journey waits it
  // out twice.
  it(
    "lets a guest open an app through a role, and not once it's gated to another",
    {
      timeout: 300_000,
    },
    async () => {
      const at = (slug: string, path = "/") =>
        `http://${slug}.robkit.localhost:${String(devPort)}${path}`;

      const journey = await roleJourney({
        devPort,
        adminUrl: `postgres://postgres:postgres@127.0.0.1:${String(postgresPort)}/robkit`,
        username: "rob",
        password: "correct horse battery",
      });

      expect(journey).toEqual({
        createdWith: "Alex, Sam",
        editedTo: "Sam",
        launcherGatedToFamily: ["example", "start"],
        openedAt: at("example"),
        heading: "Signed in as a guest",
        launcherGatedToFriends: [],
        example: { status: 404, body: "Not found" },
        start: [200, { status: 404, body: "Not found" }],
      });
    },
  );

  // Last, since it stops the stack.
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
