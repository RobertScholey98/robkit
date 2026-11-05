import { execFile, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { connect } from "node:net";
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
  testTag,
} from "@internal/test-postgres";
import { afterEach, describe, expect, it } from "vitest";
import { reportFaultsAt } from "./cli.ts";

const run = promisify(execFile);
const bin = fileURLToPath(new URL("bin.ts", import.meta.url));
const fixture = fileURLToPath(new URL("test/fixture-install", import.meta.url));

interface Dev {
  child: ChildProcess;
  root: string;
  port: number;
  output: () => string;
}

const projects: { root: string; project: string }[] = [];
const children: ChildProcess[] = [];

afterEach(async () => {
  // SIGTERM, as a terminal's close would, so robkit-dev stops the apps it
  // started; SIGKILL would leave them running in their own process groups.
  await Promise.all(
    children.splice(0).map(async (child) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill("SIGTERM");
      const exited = once(child, "exit");
      const timeout = new Promise((resolve) => setTimeout(resolve, 15_000));
      if ((await Promise.race([exited, timeout])) === undefined) {
        child.kill("SIGKILL");
      }
    }),
  );
  await Promise.all(
    projects
      .splice(0)
      .map(({ root, project }) =>
        run("docker", ["compose", "-p", project, "down", "-v"], { cwd: root }),
      ),
  );
});

async function startDev(
  env: Record<string, string> = {},
  prepare: (root: string) => Promise<void> = () => Promise.resolve(),
): Promise<Dev> {
  const root = await mkdtemp(join(tmpdir(), "robkit-dev-"));
  await cp(fixture, root, { recursive: true });
  await cp(composeFile, join(root, "compose.yaml"));
  await prepare(root);
  const port = await freePortBlock(3);
  const project = `robkit-test-${String(port)}`;
  projects.push({ root, project });
  const tag = testTag();
  removeWhenGone({ tagged: tag }, { docker: project });

  const child = spawn(process.execPath, [bin], {
    cwd: root,
    env: {
      ...process.env,
      ROBKIT_DEV_PORT: String(port),
      ROBKIT_POSTGRES_PORT: String(await freePostgresPort()),
      COMPOSE_FILE: testComposeFiles(),
      ROBKIT_TEST_TAG: tag,
      COMPOSE_PROJECT_NAME: project,
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
  return { child, root, port, output: () => output };
}

function get(port: number, host: string): Promise<string> {
  return new Promise((resolve, reject) => {
    request({ host: "127.0.0.1", port, headers: { host } }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => (body += chunk.toString()));
      res.on("end", () => {
        if (res.statusCode === 200) resolve(body);
        else reject(new Error(`${String(res.statusCode)}: ${body}`));
      });
    })
      .on("error", reject)
      .end();
  });
}

async function eventually<T>(attempt: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      return await attempt();
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

async function exitCode(child: ChildProcess): Promise<number | null> {
  if (child.exitCode !== null) return child.exitCode;
  const [code] = (await once(child, "exit")) as [number | null];
  return code;
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

async function runningContainers(root: string): Promise<string> {
  const project = projects.find((p) => p.root === root)?.project ?? "";
  const { stdout } = await run(
    "docker",
    ["compose", "-p", project, "ps", "-q"],
    {
      cwd: root,
    },
  );
  return stdout.trim();
}

/** Every container Compose made for the install, stopped or not. */
async function createdContainers(root: string): Promise<string> {
  const project = projects.find((p) => p.root === root)?.project ?? "";
  const { stdout } = await run(
    "docker",
    ["compose", "-p", project, "ps", "-a", "-q"],
    { cwd: root },
  );
  return stdout.trim();
}

async function startedApps(root: string): Promise<string[]> {
  const started = [];
  for (const slug of await readdir(join(root, "apps"))) {
    const files = await readdir(join(root, "apps", slug));
    if (files.includes("started")) started.push(slug);
  }
  return started;
}

describe("robkit-dev", () => {
  it("migrates, starts and proxies every app, then stops it all on SIGINT", async () => {
    const dev = await startDev();

    const alpha: unknown = JSON.parse(
      await eventually(() => get(dev.port, "alpha.robkit.localhost")),
    );
    const beta: unknown = JSON.parse(
      await eventually(() => get(dev.port, "beta.robkit.localhost")),
    );
    expect(alpha).toEqual({
      slug: "alpha",
      domain: "robkit.localhost",
      core: `http://core.robkit.localhost:${String(dev.port)}`,
      app: "alpha",
      apps: JSON.stringify([{ slug: "alpha" }, { slug: "beta" }]),
      database: true,
    });
    expect(beta).toEqual({
      slug: "beta",
      domain: "robkit.localhost",
      core: `http://core.robkit.localhost:${String(dev.port)}`,
      app: "beta",
      apps: JSON.stringify([{ slug: "alpha" }, { slug: "beta" }]),
      database: false,
    });
    expect(dev.output()).toMatch(/^\[alpha\] .*listening on \d+$/m);

    dev.child.kill("SIGINT");

    expect(await exitCode(dev.child)).toBe(0);
    expect(await isListening(dev.port)).toBe(false);
    expect(await isListening(dev.port + 1)).toBe(false);
    expect(await isListening(dev.port + 2)).toBe(false);
    expect(await runningContainers(dev.root)).toBe("");
  });

  it("starts nothing when a migration fails", async () => {
    const dev = await startDev({ FIXTURE_FAIL_MIGRATE: "1" });

    expect(await exitCode(dev.child)).not.toBe(0);
    expect(dev.output()).toContain("migration failed on purpose");
    expect(await startedApps(dev.root)).toEqual([]);
    expect(await runningContainers(dev.root)).toBe("");
  });

  it("refuses an app folder that isn't a slug before starting anything", async () => {
    const dev = await startDev({}, async (root) => {
      await mkdir(join(root, "apps", "my-app"));
      await writeFile(
        join(root, "apps", "my-app", "package.json"),
        JSON.stringify({ scripts: { dev: "node ../../serve.js" } }),
      );
    });

    expect(await exitCode(dev.child)).toBe(1);
    expect(dev.output()).toBe(
      `apps/my-app: "my-app" can't be an app's slug, which is also its subdomain and database role. Use lowercase letters and digits, start with a letter, and avoid public and postgres.\n`,
    );
    expect(await startedApps(dev.root)).toEqual([]);
    expect(await createdContainers(dev.root)).toBe("");
  });

  it("prints a fault it didn't expect whole, with where to report it", async () => {
    const dev = await startDev({}, async (root) => {
      await rm(join(root, "apps"), { recursive: true });
      await writeFile(join(root, "apps"), "");
    });

    expect(await exitCode(dev.child)).toBe(1);
    expect(dev.output()).toContain("ENOTDIR");
    expect(dev.output()).toMatch(/^ {4}at /m);
    expect(dev.output()).toContain(reportFaultsAt);
    expect(await createdContainers(dev.root)).toBe("");
  });

  it("stops everything and fails when an app exits", async () => {
    const dev = await startDev({ FIXTURE_CRASH: "beta" });

    expect(await exitCode(dev.child)).not.toBe(0);
    expect(await startedApps(dev.root)).toEqual(["alpha", "beta"]);
    expect(await isListening(dev.port + 1)).toBe(false);
    expect(await runningContainers(dev.root)).toBe("");
  });
});
