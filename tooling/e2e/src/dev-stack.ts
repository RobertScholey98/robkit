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
import type { Slug } from "@robkit/input";
import {
  defaultDomain,
  install,
  type Install,
} from "@robkit/session/addresses";
import { afterAll, beforeAll, beforeEach, inject } from "vitest";
import { takeBrowserLog } from "./browser.ts";
import type { InstallName } from "./install.ts";
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

/** The owner every journey signs in as, once the claim test has made them. */
export const owner = { username: "rob", password: "correct horse battery" };

/**
 * `pnpm dev` running in one of the installs, for a suite's journeys. Its
 * addresses and ports exist once the suite's `beforeAll` has run.
 */
export interface DevStack {
  /** The install's folder. */
  dir: string;
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
  /** What a journey needs to sign the owner in and reach the database. */
  journey: () => JourneyOptions;
  /** The `pnpm dev` process. */
  process: () => ChildProcess;
}

/**
 * Runs `pnpm dev` in the install `name` for the suite this is called in,
 * and stops it and its Postgres after. A failed journey prints what its
 * browser saw and what the dev runner said meanwhile.
 */
export function useDevStack(name: InstallName): DevStack {
  const dir = inject("installs")[name];
  const project = `robkit-e2e-${name}-${String(process.pid)}`;
  let dev: ChildProcess | undefined;
  let devPort = 0;
  let addresses: Install | undefined;
  let postgresPort = 0;
  let output = "";

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

  beforeAll(async () => {
    devPort = await freePortBlock(1 + (await discoverApps(dir)).length);
    addresses = install({ domain: defaultDomain, port: devPort });
    postgresPort = await freePostgresPort();
    const tag = testTag();
    removeWhenGone({ tagged: tag }, { docker: project });
    dev = spawn("pnpm", ["run", "dev"], {
      cwd: dir,
      env: {
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
      cwd: dir,
    });
  });

  return {
    dir,
    project,
    addresses: addressesOf,
    port: () => devPort,
    hostOf,
    at,
    send,
    eventually,
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
