import { execFile } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  composeFile,
  freePortBlock,
  freePostgresPort,
  removeWhenGone,
  testComposeFiles,
} from "@internal/test-postgres";
import { afterEach, describe, expect, it, onTestFinished } from "vitest";
import { CommandProblem } from "@robkit/input/command";
import { discoverApps } from "./apps.ts";
import { checkBeforeStart, type Needs } from "./checks.ts";

const run = promisify(execFile);

const fixture = fileURLToPath(new URL("test/fixture-install", import.meta.url));

/** Runs an install's Postgres on the host's network, as CI runs every test's. */
const hostNetwork = fileURLToPath(
  new URL("../../../tooling/test-postgres/host-network.yaml", import.meta.url),
);

const servers: ReturnType<typeof createServer>[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

async function hold(port: number): Promise<void> {
  const server = createServer().listen(port, "127.0.0.1");
  servers.push(server);
  await once(server, "listening");
}

/** Holds `port` as {@link hold} does, unless something already holds it. */
async function holdUnlessHeld(port: number): Promise<void> {
  try {
    await hold(port);
  } catch (error) {
    const inUse =
      error instanceof Error && "code" in error && error.code === "EADDRINUSE";
    if (!inUse) throw error;
  }
}

/**
 * What the fixture install needs, on ports of its own. Its Compose project
 * is never started: the checks only read.
 */
async function needs(): Promise<Needs> {
  const root = await mkdtemp(join(tmpdir(), "robkit-checks-"));
  await cp(fixture, root, { recursive: true });
  await cp(composeFile, join(root, "compose.yaml"));
  const devPort = await freePortBlock(3);
  const postgresPort = await freePostgresPort();
  return {
    root,
    env: {
      ...process.env,
      COMPOSE_PROJECT_NAME: `robkit-test-checks-${String(devPort)}`,
      ROBKIT_POSTGRES_PORT: String(postgresPort),
    },
    devPort,
    postgresPort,
    apps: await discoverApps(root, devPort + 1),
  };
}

/** What `checkBeforeStart` threw, as each message. */
async function problems(checked: Promise<void>): Promise<string[]> {
  try {
    await checked;
  } catch (error) {
    const each = error instanceof AggregateError ? error.errors : [error];
    expect(each.every((part) => part instanceof CommandProblem)).toBe(true);
    return each.map((part: Error) => part.message);
  }
  return [];
}

describe("checkBeforeStart", () => {
  it("passes when Docker answers and every port is free", async () => {
    expect(await problems(checkBeforeStart(await needs()))).toEqual([]);
  });

  it("says Docker isn't answering, and nothing else", async () => {
    const install = await needs();
    await hold(install.devPort);

    const said = await problems(
      checkBeforeStart({
        ...install,
        env: { ...install.env, DOCKER_HOST: "unix:///nonexistent/docker.sock" },
      }),
    );

    expect(said).toEqual([
      "Docker isn't answering, and pnpm dev runs Postgres in it. Start Docker, then run pnpm dev again.",
    ]);
  });

  it("names the proxy's port alone when it's taken, since the apps' ports follow it", async () => {
    const install = await needs();
    await hold(install.devPort);
    await hold(install.devPort + 1);

    const said = await problems(checkBeforeStart(install));

    expect(said).toEqual([
      expect.stringMatching(
        new RegExp(
          `^Port ${String(install.devPort)} is taken, and pnpm dev's proxy`,
        ),
      ),
    ]);
  });

  it("names every app port and Postgres's port that's taken", async () => {
    const install = await needs();
    await hold(install.devPort + 1);
    await hold(install.devPort + 2);
    await hold(install.postgresPort);

    const said = await problems(checkBeforeStart(install));

    expect(said).toEqual([
      expect.stringContaining("and alpha needs it under pnpm dev"),
      expect.stringContaining("and beta needs it under pnpm dev"),
      expect.stringContaining("ROBKIT_POSTGRES_PORT"),
    ]);
  });

  it(
    "passes a Postgres port its own Postgres holds on the host's network, where Docker publishes none",
    { timeout: 120_000 },
    async () => {
      const install = await needs();
      const project = `robkit-test-checks-host-${String(install.devPort)}`;
      const env: NodeJS.ProcessEnv = {
        ...install.env,
        COMPOSE_PROJECT_NAME: project,
        COMPOSE_FILE: testComposeFiles({
          COMPOSE_FILE: `compose.yaml:${hostNetwork}`,
        }),
      };
      removeWhenGone({ docker: project });
      onTestFinished(async () => {
        await run("docker", ["compose", "down", "-v"], {
          cwd: install.root,
          env,
        });
      });
      await run("docker", ["compose", "up", "-d", "--wait", "postgres"], {
        cwd: install.root,
        env,
      });
      // Where Docker runs on this machine, Postgres now holds the port
      // itself. Docker Desktop's host is a VM of its own, so there the port
      // still looks free here, and this holds it in Postgres's place.
      await holdUnlessHeld(install.postgresPort);

      expect(await problems(checkBeforeStart({ ...install, env }))).toEqual([]);
    },
  );

  it("says what Compose said when the install's compose.yaml has no Postgres", async () => {
    const install = await needs();
    await writeFile(
      join(install.root, "compose.yaml"),
      "services:\n  web:\n    image: nginx\n",
    );

    // Compose reads the file only to find the project's name, as it does
    // in an install, which sets none. It reads that file alone, as it does
    // for an owner: CI's COMPOSE_FILE adds one that names a postgres service.
    const said = await problems(
      checkBeforeStart({
        ...install,
        env: {
          ...install.env,
          COMPOSE_PROJECT_NAME: undefined,
          COMPOSE_FILE: "compose.yaml",
        },
      }),
    );

    // Compose's own words are its to change, so only that they are there.
    expect(said).toEqual([
      expect.stringMatching(
        /^docker compose ps --quiet --no-trunc postgres failed in .+: .*postgres.*\. Fix what it says, then run pnpm dev again\.$/s,
      ),
    ]);
    expect(said[0]).toContain(install.root);
  });
});
