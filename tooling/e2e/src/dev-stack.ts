import { execFile, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { request, type IncomingHttpHeaders } from "node:http";
import { promisify } from "node:util";
import {
  freePortBlock,
  freePostgresPort,
  removeWhenGone,
  testComposeFiles,
  testTag,
} from "@internal/test-postgres";
import { discoverApps } from "@robkit/dev";
import { isRecord, type Slug } from "@robkit/input";
import { defaultDomain, install, type Install } from "@robkit/input/addresses";
import { afterAll, beforeAll, beforeEach, inject } from "vitest";
import { takeBrowserLog } from "./browser.ts";
import {
  addedSlug,
  addTheApp,
  exampleSlug,
  installChoices,
  type InstallName,
} from "./install.ts";
import type { JourneyOptions } from "./owner-journey.ts";

const run = promisify(execFile);

export interface Reply {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

export interface Send {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/** The owner every journey signs in as, once `claimed()` has made them. */
export const owner = { username: "rob", password: "correct horse battery" };

/**
 * `pnpm dev` running in one of the installs, for a suite's journeys. Its
 * addresses and ports exist once the suite's `beforeAll` has run. An
 * install the global setup made gets its second app from robkit add while
 * `pnpm dev` runs, as an owner would.
 */
export interface DevStack {
  /** The install's folder. */
  readonly dir: string;
  /** Its Compose project, which holds its Postgres. */
  project: string;
  addresses: () => Install;
  /** The dev proxy's port: every app's port follows it. */
  port: () => number;
  /** The Host header that reaches `slug` through the dev proxy. */
  hostOf: (slug: Slug) => string;
  /** A URL on `slug`, as the browser sees it. */
  at: (slug: Slug, path?: string) => string;
  /** Sends a request to `host` through the dev proxy. */
  send: (host: string, path: string, options?: Send) => Promise<Reply>;
  /** Asks until `attempt` answers `status`, while the stack starts. */
  eventually: (
    attempt: () => Promise<Reply>,
    status?: number,
  ) => Promise<Reply>;
  /** Waits until core, the hub, admin and the apps `pnpm dev` started answer. */
  started: () => Promise<void>;
  /**
   * Waits for `started`, then runs robkit add for the second app, unless
   * the install had it when `pnpm dev` started.
   *
   * @returns what robkit add printed, or `undefined` when it didn't run
   */
  added: () => Promise<string | undefined>;
  /** Waits until core, the hub, admin and both apps answer. */
  up: () => Promise<void>;
  /**
   * Waits for `started`, then claims the install as `owner` unless it's
   * claimed. It doesn't wait for the added app.
   */
  claimedBeforeAdd: () => Promise<void>;
  /** Waits for `claimedBeforeAdd`, then for `up`. */
  claimed: () => Promise<void>;
  /** What a journey needs to sign the owner in and reach the database. */
  journey: () => JourneyOptions;
  /** The `pnpm dev` process. */
  process: () => ChildProcess;
}

/**
 * Runs `pnpm dev` in the install `name` for the suite this is called in,
 * and stops it and its Postgres after. A failed journey prints what its
 * browser saw and what the dev runner said meanwhile. `name` is one of the
 * installs the global setup made, or a suite's own install, by its folder
 * once an earlier `beforeAll` has made it.
 */
export function useDevStack(
  name: InstallName | { name: string; dir: () => string },
  /** Changes the install before `pnpm dev` starts in it. */
  prepare?: (dir: string) => Promise<void>,
): DevStack {
  const dirOf =
    typeof name === "string" ? () => inject("installs")[name] : name.dir;
  const label = typeof name === "string" ? name : name.name;
  // The global setup makes its installs without the second app, so the
  // suite adds it after the example's stack.
  const exampleStack =
    typeof name === "string" ? installChoices[name].exampleStack : undefined;
  const adds = exampleStack !== undefined;
  const project = `robkit-e2e-${label}-${String(process.pid)}`;
  let dev: ChildProcess | undefined;
  let devPort = 0;
  let addresses: Install | undefined;
  let postgresPort = 0;
  let output = "";
  let isStarted: Promise<void> | undefined;
  let isAdded: Promise<string | undefined> | undefined;
  let isUp: Promise<void> | undefined;
  let isClaimed: Promise<void> | undefined;

  const started = <T>(value: T | undefined, what: string): T => {
    if (value === undefined) {
      throw new Error(`${what} is set in beforeAll, which hasn't run.`);
    }
    return value;
  };
  const addressesOf = () => started(addresses, "The install's addresses");
  const hostOf = (slug: Slug) => new URL(addressesOf().origin(slug)).host;
  const at = (slug: Slug, path = "/") => `${addressesOf().origin(slug)}${path}`;

  const send = (
    host: string,
    path: string,
    { method = "GET", headers = {}, body }: Send = {},
  ): Promise<Reply> =>
    new Promise((resolve, reject) => {
      request(
        {
          host: "127.0.0.1",
          port: devPort,
          method,
          path,
          headers: { host, ...headers },
          // A connection of its own: one the proxy closes for idling while
          // the agent hands it out ends the request with a reset.
          agent: false,
        },
        (res) => {
          let text = "";
          res.on("data", (chunk: Buffer) => (text += chunk.toString()));
          res.on("end", () => {
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body: text,
            });
          });
        },
      )
        .on("error", reject)
        .end(body);
    });

  const eventually = async (
    attempt: () => Promise<Reply>,
    status = 200,
  ): Promise<Reply> => {
    const deadline = Date.now() + 120_000;
    for (;;) {
      // A stack still starting refuses connections, so keep asking.
      const reply = await attempt().catch(() => undefined);
      if (reply?.status === status) return reply;
      if (Date.now() > deadline) {
        throw new Error(`the stack never came up:\n${output}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  };

  // pnpm dev waits for no app, and the proxy answers 502 for one still
  // starting. Signed out, a guarded app answers a fetch with 401.
  const startedUp = () =>
    (isStarted ??= Promise.all([
      eventually(() => send(hostOf("hub"), "/")),
      eventually(() => send(hostOf("core"), "/status")),
      eventually(() => send(hostOf("admin"), "/"), 401),
      eventually(() => send(hostOf(exampleSlug), "/"), 401),
      ...(adds ? [] : [eventually(() => send(hostOf(addedSlug), "/"))]),
    ]).then(() => undefined));

  const added = () =>
    (isAdded ??= startedUp().then(() =>
      exampleStack ? addTheApp(dirOf(), exampleStack) : undefined,
    ));

  const up = () =>
    (isUp ??= added().then(async () => {
      await eventually(() => send(hostOf(addedSlug), "/"));
    }));

  const claimedBeforeAdd = () =>
    (isClaimed ??= startedUp().then(async () => {
      const core = hostOf("core");
      const origin = addressesOf().origin("hub");
      const session = await send(core, "/session", { headers: { origin } });
      const answer: unknown = JSON.parse(session.body);
      if (!isRecord(answer) || answer.state !== "unclaimed") return;
      const setup = await send(core, "/setup", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(owner),
      });
      if (setup.status !== 201) {
        throw new Error(
          `Claiming the install answered ${String(setup.status)}: ${setup.body}`,
        );
      }
    }));
  const claimed = () => claimedBeforeAdd().then(up);

  beforeAll(async () => {
    const dir = dirOf();
    await prepare?.(dir);
    // The proxy, each app, and the app robkit add starts.
    const apps = (await discoverApps(dir)).length;
    devPort = await freePortBlock(1 + apps + (adds ? 1 : 0));
    addresses = install({ domain: defaultDomain, port: devPort });
    postgresPort = await freePostgresPort();
    const tag = testTag();
    removeWhenGone({ tagged: tag }, { docker: project });
    dev = spawn("pnpm", ["run", "dev"], {
      cwd: dir,
      env: {
        // This suite's VITEST goes along. robkit-dev keeps it from each
        // app, whose robkit() would set nothing up under it.
        ...process.env,
        ROBKIT_DEV_PORT: String(devPort),
        ROBKIT_POSTGRES_PORT: String(postgresPort),
        COMPOSE_FILE: testComposeFiles(),
        ROBKIT_TEST_TAG: tag,
        COMPOSE_PROJECT_NAME: project,
      },
      // Its own process group, like a terminal's foreground job, so SIGINT
      // reaches it the way Ctrl-C would.
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    dev.stdout?.on("data", (chunk: Buffer) => (output += chunk.toString()));
    dev.stderr?.on("data", (chunk: Buffer) => (output += chunk.toString()));
  });

  // A journey that times out says only what it waited for. Print what the
  // browser saw and what the dev runner said meanwhile.
  beforeEach(({ onTestFailed }) => {
    takeBrowserLog();
    const outputFrom = output.length;
    onTestFailed(() => {
      console.error(
        `What the browser saw:\n${takeBrowserLog()}\n\nWhat pnpm dev said meanwhile:\n${output.slice(outputFrom).slice(-8000)}`,
      );
    });
  });

  afterAll(async () => {
    if (dev?.exitCode === null && dev.pid) process.kill(-dev.pid, "SIGKILL");
    await run("docker", ["compose", "-p", project, "down", "-v"], {
      cwd: dirOf(),
    });
  });

  return {
    get dir() {
      return dirOf();
    },
    project,
    addresses: addressesOf,
    port: () => devPort,
    hostOf,
    at,
    send,
    eventually,
    started: startedUp,
    added,
    up,
    claimedBeforeAdd,
    claimed,
    journey: () => ({
      install: addressesOf(),
      adminUrl: `postgres://postgres:postgres@127.0.0.1:${String(postgresPort)}/robkit`,
      ...owner,
    }),
    process: () => started(dev, "pnpm dev"),
  };
}

/** Stops `pnpm dev` as Ctrl-C would, answering with its exit code. */
export async function interrupt(dev: DevStack): Promise<number | null> {
  const { pid } = dev.process();
  if (!pid) throw new Error(`pnpm dev never started in ${dev.dir}.`);
  process.kill(-pid, "SIGINT");
  const [code] = (await once(dev.process(), "exit")) as [number | null];
  return code;
}
