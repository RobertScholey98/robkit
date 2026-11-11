import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, symlink } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { removeWhenGone } from "./clean-up.ts";

export { removeWhenGone, testTag, type Leftover } from "./clean-up.ts";
export { homeOfItsOwn } from "./home.ts";

const run = promisify(execFile);

/** The install template's compose file, so tests run the Postgres that an install's `pnpm dev` runs. */
export const composeFile = fileURLToPath(
  new URL(
    "../../../packages/create-robkit/templates/base/compose.yaml",
    import.meta.url,
  ),
);

const inMemory = fileURLToPath(new URL("../in-memory.yaml", import.meta.url));

/**
 * COMPOSE_FILE for a test's Postgres: the install's `compose.yaml`, or the
 * files COMPOSE_FILE already names (CI adds host-network.yaml), followed by
 * in-memory.yaml, which keeps the database off the disk.
 */
export function testComposeFiles(env: NodeJS.ProcessEnv = process.env): string {
  return [env.COMPOSE_FILE ?? "compose.yaml", inMemory].join(":");
}

export interface TestPostgres {
  /** Superuser URL for the `robkit` database. */
  adminUrl: string;
  /** The Compose project the container runs under. */
  project: string;
  /** Removes the container and its volume. */
  stop: () => Promise<void>;
}

function listenOn(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("no port assigned"));
      });
    });
  });
}

/**
 * A port nothing is listening on, which no other test process on the
 * machine gets while this one runs: the first of a block it leases. A port
 * the OS picked could go to another test's server before the caller bound
 * it. On 2026-11-11 in CI, core's start test asked its port for `/status`
 * and read the 201 a proxy test's server answers.
 */
export function freePort(): Promise<number> {
  return freePortBlock(1);
}

/** The host ports Docker publishes for running containers. */
export async function publishedPorts(): Promise<Set<number>> {
  const { stdout } = await run("docker", ["ps", "--format", "{{.Ports}}"]);
  return new Set(
    [...stdout.matchAll(/:(\d+)->/g)].map(([, port]) => Number(port)),
  );
}

/**
 * A port for a Postgres container to publish. Docker Desktop publishes ports
 * from its own VM, so a port another container already has still looks free
 * here; this also skips every port Docker publishes.
 */
export async function freePostgresPort(): Promise<number> {
  const taken = await publishedPorts();
  for (;;) {
    const port = await freePort();
    if (!taken.has(port)) return port;
  }
}

/**
 * Where every test process on the machine leases its port blocks: one
 * symlink per block, named for its first port, pointing at the pid that
 * holds it.
 */
export const portLeases = join(tmpdir(), "robkit-port-leases");

// Blocks start every `blockSpan` ports from 20000, so two blocks overlap
// only when they share a first port, and one lease covers a whole block.
const blockSpan = 20;
const blocks = 500;
const attempts = 50;

export interface PortBlockOptions {
  /** The leases folder: `portLeases` unless a test keeps its own. */
  leases?: string;
  /** Which block to try next, from 0 to 499: one at random unless a test says. */
  pick?: () => number;
}

/** Each leases folder this process uses, once it is made and watched. */
const watching = new Map<string, Promise<void>>();

/**
 * Makes the leases folder and sets the watcher that removes this process's
 * leases once it is gone. It does so once for each folder, however many
 * ask at the same time: a second watcher would race the first to remove
 * the same leases, and one of them would stop on a lease already gone.
 */
function watch(leases: string): Promise<void> {
  let ready = watching.get(leases);
  if (!ready) {
    ready = mkdir(leases, { recursive: true }).then(() => {
      removeWhenGone({ leases, owner: process.pid });
    });
    watching.set(leases, ready);
  }
  return ready;
}

/** Takes the lease on the block starting at `first`, or says it's taken. */
async function lease(leases: string, first: number): Promise<boolean> {
  await watch(leases);
  try {
    // Making a symlink is atomic, so of two processes that ask at once only
    // one gets it.
    await symlink(String(process.pid), join(leases, String(first)));
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      return false;
    }
    throw error;
  }
}

/**
 * Finds `size` consecutive free ports, for robkit-dev's proxy port and the
 * app ports that follow it, and leases them until this process
 * exits, so no other test process on the machine gets them in the meantime.
 * Their probe sockets close before this returns, so the caller's servers
 * can bind them later. The block sits below the OS's ephemeral range,
 * where the OS finds a port for each server that asks for any, and would
 * soon give one of these to someone else.
 */
export async function freePortBlock(
  size: number,
  {
    leases = portLeases,
    pick = () => Math.floor(Math.random() * blocks),
  }: PortBlockOptions = {},
): Promise<number> {
  if (size > blockSpan) {
    throw new Error(
      `A port block holds at most ${String(blockSpan)} ports, not ${String(size)}.`,
    );
  }
  for (let attempt = 0; attempt < attempts; attempt++) {
    const first = 20_000 + blockSpan * pick();
    if (!(await lease(leases, first))) continue;
    try {
      for (let port = first; port < first + size; port++) await listenOn(port);
      return first;
    } catch {
      // Something outside the tests has one of its ports. The lease stays,
      // so no one tries this block again until this process exits.
    }
  }
  throw new Error(
    `No free block of ${String(size)} ports in ${String(attempts)} tries. Check what is listening between 20000 and 30000, and the leases in ${leases}.`,
  );
}

/**
 * Starts a private Postgres from the root compose file under a unique
 * project name, so parallel test suites never share a database.
 */
export async function startPostgres(): Promise<TestPostgres> {
  const port = await freePostgresPort();
  const project = `robkit-test-${randomBytes(4).toString("hex")}`;
  removeWhenGone({ docker: project });
  const env = {
    ...process.env,
    ROBKIT_POSTGRES_PORT: String(port),
    COMPOSE_FILE: testComposeFiles(),
  };
  // From the template's folder rather than with -f, so COMPOSE_FILE adds to
  // it here as it does for an install's pnpm dev.
  const compose = (...args: string[]) =>
    run("docker", ["compose", "-p", project, ...args], {
      cwd: dirname(composeFile),
      env,
    });

  const stop = async () => {
    await compose("down", "-v");
  };

  try {
    await compose("up", "-d", "--wait");
  } catch (error) {
    await stop();
    throw error;
  }

  return {
    adminUrl: `postgres://postgres:postgres@127.0.0.1:${String(port)}/robkit`,
    project,
    stop,
  };
}
