import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

/** The install's own compose file at the repo root, so tests run the Postgres that `pnpm dev` runs. */
export const composeFile = fileURLToPath(
  new URL("../../../compose.yaml", import.meta.url),
);

export interface TestPostgres {
  /** Superuser URL for the `robkit` database. */
  adminUrl: string;
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

/** Asks the OS for a port nothing is listening on. */
export function freePort(): Promise<number> {
  return listenOn(0);
}

/**
 * Finds `size` consecutive free ports, for robkit-dev's proxy port and the
 * app ports that follow it. The block sits below the OS's ephemeral range,
 * since the OS hands out ephemeral ports in sequence and would soon give a
 * neighbour of `freePort()` to someone else.
 */
export async function freePortBlock(size: number): Promise<number> {
  for (;;) {
    const first = 20_000 + Math.floor(Math.random() * 10_000);
    try {
      for (let port = first; port < first + size; port++) await listenOn(port);
      return first;
    } catch {
      // Taken; try another block.
    }
  }
}

/**
 * Starts a private Postgres from the root compose file under a unique
 * project name, so parallel test suites never share a database.
 */
export async function startPostgres(): Promise<TestPostgres> {
  const port = await freePort();
  const project = `robkit-test-${randomBytes(4).toString("hex")}`;
  const env = { ...process.env, ROBKIT_POSTGRES_PORT: String(port) };
  const compose = (...args: string[]) =>
    run("docker", ["compose", "-f", composeFile, "-p", project, ...args], {
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
    stop,
  };
}
