// Runs robkit-dev in a copy of the fixture install, for the runner's tests
// that need Docker, and stops it and its Postgres after each test.

import { execFile, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, readdir } from "node:fs/promises";
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
import { afterEach } from "vitest";

const run = promisify(execFile);
const bin = fileURLToPath(new URL("../robkit-dev-command.ts", import.meta.url));
const fixture = fileURLToPath(new URL("fixture-install", import.meta.url));

export interface Dev {
  child: ChildProcess;
  root: string;
  port: number;
  /** The environment it runs with, for a second run in the same install. */
  env: NodeJS.ProcessEnv;
  output: () => string;
}

const projects: { root: string; project: string }[] = [];
const children: ChildProcess[] = [];

/**
 * After each test, stops every robkit-dev it started and removes each
 * install's Compose project.
 */
export function stopRunsAfterEach(): void {
  afterEach(async () => {
    // SIGTERM, as a process manager would, so robkit-dev stops the apps it
    // started; SIGKILL would leave them running in their own process groups.
    // A terminal's close sends SIGHUP, which a test sends.
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
      projects.splice(0).map(({ root, project }) =>
        run("docker", ["compose", "-p", project, "down", "-v"], {
          cwd: root,
        }),
      ),
    );
  });
}

/**
 * A copy of the fixture install, and the environment robkit-dev runs it
 * with: its own ports, and its own Compose project, removed after the test.
 */
export async function devInstall(
  prepare: (root: string) => Promise<void> = () => Promise.resolve(),
): Promise<{ root: string; port: number; env: NodeJS.ProcessEnv }> {
  const root = await mkdtemp(join(tmpdir(), "robkit-dev-"));
  await cp(fixture, root, { recursive: true });
  await cp(composeFile, join(root, "compose.yaml"));
  await prepare(root);
  const port = await freePortBlock(3);
  const project = `robkit-test-${String(port)}`;
  projects.push({ root, project });
  const tag = testTag();
  removeWhenGone({ tagged: tag }, { docker: project });
  // The runner's socket goes here, apart from every other run's.
  const runtime = await mkdtemp(join(tmpdir(), "robkit-run-"));
  removeWhenGone({ path: runtime });
  return {
    root,
    port,
    env: {
      ...process.env,
      XDG_RUNTIME_DIR: runtime,
      // Each app gets it from robkit-dev, not from the shell.
      NEXT_TELEMETRY_DISABLED: undefined,
      // As a test that starts pnpm dev hands it. No app may see it.
      VITEST: "true",
      ROBKIT_DEV_PORT: String(port),
      ROBKIT_POSTGRES_PORT: String(await freePostgresPort()),
      COMPOSE_FILE: testComposeFiles(),
      ROBKIT_TEST_TAG: tag,
      COMPOSE_PROJECT_NAME: project,
    },
  };
}

export async function startDev(
  env: NodeJS.ProcessEnv = {},
  prepare: (root: string) => Promise<void> = () => Promise.resolve(),
): Promise<Dev> {
  const { root, port, env: devEnv } = await devInstall(prepare);
  return startIn(root, port, { ...devEnv, ...env });
}

/** robkit-dev, run in the install at `root` with `env`. */
export function startIn(
  root: string,
  port: number,
  env: NodeJS.ProcessEnv,
): Dev {
  const child = spawn(process.execPath, [bin], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
  return { child, root, port, env, output: () => output };
}

export function get(port: number, host: string, path = "/"): Promise<string> {
  return new Promise((resolve, reject) => {
    request({ host: "127.0.0.1", port, path, headers: { host } }, (res) => {
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

export async function eventually<T>(attempt: () => Promise<T>): Promise<T> {
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

export async function exitCode(child: ChildProcess): Promise<number | null> {
  if (child.exitCode !== null) return child.exitCode;
  const [code] = (await once(child, "exit")) as [number | null];
  return code;
}

export function isListening(port: number): Promise<boolean> {
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

function projectOf(root: string): string {
  return projects.find((p) => p.root === root)?.project ?? "";
}

export async function runningContainers(root: string): Promise<string> {
  const { stdout } = await run(
    "docker",
    ["compose", "-p", projectOf(root), "ps", "-q"],
    { cwd: root },
  );
  return stdout.trim();
}

/** Every container Compose made for the install, stopped or not. */
export async function createdContainers(root: string): Promise<string> {
  const { stdout } = await run(
    "docker",
    ["compose", "-p", projectOf(root), "ps", "-a", "-q"],
    { cwd: root },
  );
  return stdout.trim();
}

export async function startedApps(root: string): Promise<string[]> {
  const started = [];
  for (const slug of await readdir(join(root, "apps"))) {
    const files = await readdir(join(root, "apps", slug));
    if (files.includes("started")) started.push(slug);
  }
  return started;
}
