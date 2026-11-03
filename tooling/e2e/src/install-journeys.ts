import { execFile, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { request, type IncomingHttpHeaders } from "node:http";
import { connect } from "node:net";
import { promisify } from "node:util";
import { freePort, freePortBlock } from "@internal/test-postgres";
import { discoverApps } from "@robkit/dev";
import {
  defaultDomain,
  install,
  type Install,
} from "@robkit/session/addresses";
import type { Choices } from "create-robkit";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { a11yJourney } from "./a11y-journey.ts";
import { addedAppJourney } from "./added-app-journey.ts";
import { guestJourney } from "./guest-journey.ts";
import {
  addedIcon,
  addedSlug,
  installChoices,
  type InstallName,
} from "./install.ts";
import { ownerJourney } from "./owner-journey.ts";
import { roleJourney } from "./role-journey.ts";
import { serverFunctionJourney } from "./server-function-journey.ts";

const run = promisify(execFile);

/** The Host header that reaches `slug` through the dev proxy. */
function hostOf(slug: string): string {
  return new URL(addresses.origin(slug)).host;
}

/** A URL on `slug`, as the browser sees it. */
function at(slug: string, path = "/"): string {
  return `${addresses.origin(slug)}${path}`;
}

interface Reply {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

let dev: ChildProcess;
let devPort: number;
let addresses: Install;
let postgresPort: number;
let output = "";

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

async function eventually(
  attempt: () => Promise<Reply>,
  status = 200,
): Promise<Reply> {
  const deadline = Date.now() + 120_000;
  for (;;) {
    const reply = await attempt().catch(() => undefined);
    if (reply?.status === status) return reply;
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

export interface JourneyOptions {
  /**
   * Whether to run the role journey, which waits out the app's cached rule
   * twice and takes nearly two minutes. It tests core and the guard, which
   * every install shares.
   */
  roles?: boolean;
}

/**
 * Runs `pnpm dev` in the install `name`, and takes the owner and guests
 * through it in a browser.
 */
export function describeJourneys(
  name: InstallName,
  { roles = true }: JourneyOptions = {},
): void {
  const dir = inject("installs")[name];
  const choices: Choices = installChoices[name];
  const [stack] = choices.generators;
  const project = `robkit-e2e-${name}-${String(process.pid)}`;

  beforeAll(async () => {
    devPort = await freePortBlock(1 + (await discoverApps(dir)).length);
    addresses = install({ domain: defaultDomain, port: devPort });
    postgresPort = await freePort();
    dev = spawn("pnpm", ["dev"], {
      cwd: dir,
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
    await run("docker", ["compose", "-p", project, "down", "-v"], {
      cwd: dir,
    });
  });

  describe(`pnpm dev in an install with the ${stack} example on ${choices.orm}`, () => {
    it("serves the hub on hub.robkit.localhost", async () => {
      const hub = await eventually(() => get(hostOf("hub")));

      expect(hub.headers["content-type"]).toMatch(/text\/html/);
      expect(hub.body).toContain('<div id="root">');
    });

    it("serves core on core.robkit.localhost, open to the hub", async () => {
      const hubOrigin = addresses.origin("hub");

      const status = await eventually(() =>
        get(hostOf("core"), "/status", {
          origin: hubOrigin,
        }),
      );

      expect(JSON.parse(status.body)).toEqual({ status: "ok" });
      expect(status.headers["access-control-allow-origin"]).toBe(hubOrigin);
    });

    it("lets the owner claim the install and stay signed in", async () => {
      const core = hostOf("core");
      const origin = addresses.origin("hub");

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
      expect(cookie).toContain(`; Domain=${addresses.domain};`);
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

    it("guards the example app: login, return and refresh bounce", async () => {
      const example = at("example");
      // pnpm dev waits for no app. Until the guard answers a signed-out
      // fetch with 401, the proxy may still be answering 502.
      await eventually(() => get(hostOf("example")), 401);

      const journey = await ownerJourney({
        install: addresses,
        adminUrl: `postgres://postgres:postgres@127.0.0.1:${String(postgresPort)}/robkit`,
        username: "rob",
        password: "correct horse battery",
      });

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
    });

    // Only a Start app has server functions.
    it.runIf(stack === "start")(
      "sends a server function call with an expired session through core's refresh",
      async () => {
        const example = at("example");

        const journey = await serverFunctionJourney({
          install: addresses,
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
      },
    );

    it("signs guests in with codes, keeps them out of owner-only apps, and ends a revoked code's session", async () => {
      const example = at("example");
      const notFound = { status: 404, body: "Not found" };

      const journey = await guestJourney({
        install: addresses,
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

    it("lets a guest open the app robkit add made, open to anyone", async () => {
      // Open lets a signed-out visitor in too.
      await eventually(() => get(hostOf(addedSlug)));

      const journey = await addedAppJourney({
        install: addresses,
        slug: addedSlug,
      });

      expect(journey).toEqual({
        icon: addedIcon,
        openedAt: at(addedSlug),
        heading: "Signed in as a guest",
      });
    });

    // E2E_SCREENSHOTS names a folder to save each page in, to look at.
    it("draws every page with no accessibility violations axe finds", async () => {
      const dir = process.env.E2E_SCREENSHOTS;
      const journey = await a11yJourney({
        install: addresses,
        username: "rob",
        password: "correct horse battery",
        slug: addedSlug,
        screenshots: dir ? { dir, prefix: name } : undefined,
      });

      expect(journey).toEqual({
        "hub-sign-in": [],
        launcher: [],
        admin: [],
        example: [],
        added: [],
      });
    });

    // The example app keeps its rule for a minute, and this journey waits it
    // out twice.
    it.runIf(roles)(
      "lets a guest open an app through a role, and not once it's gated to another",
      {
        timeout: 300_000,
      },
      async () => {
        const journey = await roleJourney({
          install: addresses,
          adminUrl: `postgres://postgres:postgres@127.0.0.1:${String(postgresPort)}/robkit`,
          username: "rob",
          password: "correct horse battery",
        });

        expect(journey).toEqual({
          createdWith: "Alex, Sam",
          editedTo: "Sam",
          launcherGatedToFamily: [addedSlug, "example"],
          openedAt: at("example"),
          heading: "Signed in as a guest",
          launcherGatedToFriends: [addedSlug],
          example: { status: 404, body: "Not found" },
        });
      },
    );

    // Last, since it stops the stack.
    it("stops every app and Postgres on Ctrl-C", async () => {
      const apps = await discoverApps(dir, devPort + 1);
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
          cwd: dir,
        },
      );
      expect(running.stdout.trim()).toBe("");
    });
  });
}
