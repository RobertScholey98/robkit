import { execFile, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { request } from "node:http";
import { connect, createServer } from "node:net";
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
import { afterEach, describe, expect, it, onTestFinished } from "vitest";
import { CommandProblem, reportFaultsAt } from "@robkit/input/command";
import { runDev } from "./runner.ts";

const run = promisify(execFile);
const bin = fileURLToPath(new URL("robkit-dev-command.ts", import.meta.url));
const fixture = fileURLToPath(new URL("test/fixture-install", import.meta.url));

interface Dev {
  child: ChildProcess;
  root: string;
  port: number;
  /** The environment it runs with, for a second run in the same install. */
  env: NodeJS.ProcessEnv;
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

/**
 * A copy of the fixture install, and the environment robkit-dev runs it
 * with: its own ports, and its own Compose project, removed after the test.
 */
async function devInstall(
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
  return {
    root,
    port,
    env: {
      ...process.env,
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

async function startDev(
  env: NodeJS.ProcessEnv = {},
  prepare: (root: string) => Promise<void> = () => Promise.resolve(),
): Promise<Dev> {
  const { root, port, env: devEnv } = await devInstall(prepare);
  return startIn(root, port, { ...devEnv, ...env });
}

/** robkit-dev, run in the install at `root` with `env`. */
function startIn(root: string, port: number, env: NodeJS.ProcessEnv): Dev {
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
    // Neither holds `vitest`: an app pnpm dev runs is no test run.
    expect(alpha).toEqual({
      slug: "alpha",
      domain: "robkit.localhost",
      core: `http://core.robkit.localhost:${String(dev.port)}`,
      app: "alpha",
      apps: JSON.stringify([{ slug: "alpha" }, { slug: "beta" }]),
      database: true,
      nextTelemetry: "1",
      listeningOn: "127.0.0.1",
    });
    expect(beta).toEqual({
      slug: "beta",
      domain: "robkit.localhost",
      core: `http://core.robkit.localhost:${String(dev.port)}`,
      app: "beta",
      apps: JSON.stringify([{ slug: "alpha" }, { slug: "beta" }]),
      database: false,
      nextTelemetry: "1",
      listeningOn: "127.0.0.1",
    });
    expect(dev.output()).toMatch(/^\[alpha\] .*listening on \d+$/m);

    dev.child.kill("SIGINT");

    expect(await exitCode(dev.child)).toBe(0);
    expect(await isListening(dev.port)).toBe(false);
    expect(await isListening(dev.port + 1)).toBe(false);
    expect(await isListening(dev.port + 2)).toBe(false);
    expect(await runningContainers(dev.root)).toBe("");
  });

  it("has core and every app listen on 127.0.0.1 with HOST exported in the shell", async () => {
    const dev = await startDev({ HOST: "0.0.0.0" });

    const alpha = await eventually(() =>
      get(dev.port, "alpha.robkit.localhost"),
    );
    const beta = await eventually(() => get(dev.port, "beta.robkit.localhost"));

    expect(JSON.parse(alpha)).toMatchObject({ listeningOn: "127.0.0.1" });
    expect(JSON.parse(beta)).toMatchObject({ listeningOn: "127.0.0.1" });
  });

  it("prints an app's address once it answers, so a request made then gets the app", async () => {
    // alpha listens 2 seconds after it starts, long after the proxy does.
    const dev = await startDev({ FIXTURE_SLOW_START: "alpha" });
    const address = `alpha is ready at http://alpha.robkit.localhost:${String(dev.port)}`;

    const answer = await new Promise<string>((resolve, reject) => {
      const onData = () => {
        if (!dev.output().includes(address)) return;
        dev.child.stdout?.off("data", onData);
        // The moment the line is printed, before anything else happens.
        get(dev.port, "alpha.robkit.localhost").then(resolve, reject);
      };
      dev.child.stdout?.on("data", onData);
      dev.child.on("exit", () => {
        reject(new Error(`robkit-dev exited first:\n${dev.output()}`));
      });
    });

    expect(JSON.parse(answer)).toMatchObject({ slug: "alpha" });
  });

  // In this process, so the coverage report sees the runner. The test above
  // proves the command's own signal handling.
  it("runs the install in this process until SIGINT, then stops it all", async () => {
    const { root, port, env } = await devInstall();
    onTestFinished(() => {
      process.emit("SIGINT", "SIGINT");
    });

    const running = runDev(root, env);
    const alpha = await eventually(() => get(port, "alpha.robkit.localhost"));
    process.emit("SIGINT", "SIGINT");

    expect(JSON.parse(alpha)).toMatchObject({ slug: "alpha", database: true });
    expect(await running).toBe(0);
    expect(await isListening(port)).toBe(false);
    expect(await runningContainers(root)).toBe("");
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

  it("stops everything and says why when an app can't start", async () => {
    const dev = await startDev({ FIXTURE_REMOVE_APP: "beta" });

    expect(await exitCode(dev.child)).toBe(1);
    expect(dev.output()).toContain("beta couldn't start, stopping\n");
    expect(dev.output()).toMatch(
      /^pnpm run dev couldn't start in \S+\/apps\/beta \(spawn pnpm ENOENT\)\. Check that pnpm is installed and on your PATH, and that the folder exists\.$/m,
    );
    expect(dev.output()).not.toContain(reportFaultsAt);
    expect(await isListening(dev.port + 1)).toBe(false);
    expect(await runningContainers(dev.root)).toBe("");
  });

  it("stops everything and fails when an app exits", async () => {
    const dev = await startDev({
      FIXTURE_CRASH: "beta",
      FIXTURE_SLOW_START: "alpha",
    });

    expect(await exitCode(dev.child)).not.toBe(0);
    expect(await startedApps(dev.root)).toEqual(["alpha", "beta"]);
    expect(await isListening(dev.port + 1)).toBe(false);
    expect(await runningContainers(dev.root)).toBe("");
  });
});

/** Where the install's Postgres container listens on this machine. */
async function publishedPostgres(root: string): Promise<string> {
  const project = projects.find((p) => p.root === root)?.project ?? "";
  const { stdout } = await run(
    "docker",
    ["compose", "-p", project, "port", "postgres", "5432"],
    { cwd: root },
  );
  return stdout.trim();
}

describe("robkit-dev's settings in the install's .env", () => {
  it("moves Postgres and the runner together with ROBKIT_POSTGRES_PORT there", async () => {
    const port = await freePostgresPort();
    const dev = await startDev(
      { ROBKIT_POSTGRES_PORT: undefined },
      async (root) => {
        await writeFile(
          join(root, ".env"),
          `ROBKIT_POSTGRES_PORT=${String(port)}\n`,
        );
      },
    );

    // alpha has a database, so the runner reached Postgres to provision it.
    const alpha = await eventually(() =>
      get(dev.port, "alpha.robkit.localhost"),
    );

    expect(JSON.parse(alpha)).toMatchObject({ database: true });
    expect(await publishedPostgres(dev.root)).toBe(`127.0.0.1:${String(port)}`);
  });

  it("keeps the shell's ROBKIT_POSTGRES_PORT over the file's", async () => {
    const inFile = await freePostgresPort();
    const inShell = await freePostgresPort();
    const dev = await startDev(
      { ROBKIT_POSTGRES_PORT: String(inShell) },
      async (root) => {
        await writeFile(
          join(root, ".env"),
          `ROBKIT_POSTGRES_PORT=${String(inFile)}\n`,
        );
      },
    );

    const alpha = await eventually(() =>
      get(dev.port, "alpha.robkit.localhost"),
    );

    expect(JSON.parse(alpha)).toMatchObject({ database: true });
    expect(await publishedPostgres(dev.root)).toBe(
      `127.0.0.1:${String(inShell)}`,
    );
  });
});

/** Holds `port` on 127.0.0.1 until the test ends, as another program would. */
async function holding(port: number): Promise<void> {
  const server = createServer();
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  onTestFinished(() => {
    server.close();
  });
}

describe("robkit-dev's checks before it starts", () => {
  it("says to start Docker, in one line, and starts nothing when Docker doesn't answer", async () => {
    // A Docker that doesn't answer, rather than stopping this machine's.
    const dev = await startDev({
      DOCKER_HOST: "unix:///nonexistent/docker.sock",
    });

    expect(await exitCode(dev.child)).toBe(1);
    expect(dev.output()).toBe(
      "Docker isn't answering, and pnpm dev runs Postgres in it. Start Docker, then run pnpm dev again.\n",
    );
    expect(await startedApps(dev.root)).toEqual([]);
    expect(await createdContainers(dev.root)).toBe("");
  });

  it("names the proxy's port and ROBKIT_DEV_PORT when it's taken, and starts nothing", async () => {
    const { root, port, env } = await devInstall();
    await holding(port);

    const dev = startIn(root, port, env);

    expect(await exitCode(dev.child)).toBe(1);
    expect(dev.output()).toBe(
      `Port ${String(port)} is taken, and pnpm dev's proxy needs it. If pnpm dev is already running in this install, use that one or stop it. Otherwise free the port, or set ROBKIT_DEV_PORT in this install's .env to another port.\n`,
    );
    expect(await startedApps(root)).toEqual([]);
    expect(await createdContainers(root)).toBe("");
  });

  it("names an app's port, the app and ROBKIT_DEV_PORT when the app's port is taken", async () => {
    const { root, port, env } = await devInstall();
    await holding(port + 2);

    const dev = startIn(root, port, env);

    expect(await exitCode(dev.child)).toBe(1);
    expect(dev.output()).toBe(
      `Port ${String(port + 2)} is taken, and beta needs it under pnpm dev. Free it, or set ROBKIT_DEV_PORT in this install's .env to move every app's port: they follow the proxy's.\n`,
    );
    expect(await startedApps(root)).toEqual([]);
    expect(await createdContainers(root)).toBe("");
  });

  it("names Postgres's port and ROBKIT_POSTGRES_PORT when something else holds it", async () => {
    const { root, port, env } = await devInstall();
    const postgresPort = Number(env.ROBKIT_POSTGRES_PORT);
    await holding(postgresPort);

    const dev = startIn(root, port, env);

    expect(await exitCode(dev.child)).toBe(1);
    expect(dev.output()).toBe(
      `Port ${String(postgresPort)} is taken, and this install's Postgres needs it. Free it, or set ROBKIT_POSTGRES_PORT in this install's .env to another port.\n`,
    );
    expect(await startedApps(root)).toEqual([]);
    expect(await createdContainers(root)).toBe("");
  });

  it("prints each taken port as a problem, with no bug line", async () => {
    const { root, port, env } = await devInstall();
    await holding(port + 1);
    await holding(Number(env.ROBKIT_POSTGRES_PORT));

    const dev = startIn(root, port, env);

    expect(await exitCode(dev.child)).toBe(1);
    expect(dev.output().split("\n")).toEqual([
      expect.stringMatching(/^Port \d+ is taken, and alpha needs it/),
      expect.stringMatching(/^Port \d+ is taken, and this install's Postgres/),
      "",
    ]);
  });

  it("refuses a second pnpm dev in the same install in one line, and the first keeps answering", async () => {
    const first = await startDev();
    await eventually(() => get(first.port, "alpha.robkit.localhost"));

    const second = startIn(first.root, first.port, first.env);

    expect(await exitCode(second.child)).toBe(1);
    expect(second.output()).toBe(
      `Port ${String(first.port)} is taken, and pnpm dev's proxy needs it. If pnpm dev is already running in this install, use that one or stop it. Otherwise free the port, or set ROBKIT_DEV_PORT in this install's .env to another port.\n`,
    );
    expect(
      JSON.parse(await get(first.port, "alpha.robkit.localhost")),
    ).toMatchObject({ slug: "alpha", database: true });
    expect(await runningContainers(first.root)).not.toBe("");
  });

  it("starts with no change to any setting after pnpm dev and its apps were killed", async () => {
    const first = await startDev();
    await eventually(() => get(first.port, "alpha.robkit.localhost"));

    first.child.kill("SIGKILL");
    await exitCode(first.child);
    for (const slug of ["alpha", "beta"]) {
      const pid = Number(
        await readFile(join(first.root, "apps", slug, "started"), "utf8"),
      );
      process.kill(pid, "SIGKILL");
    }
    await eventually(async () => {
      if (await isListening(first.port + 1)) throw new Error("alpha is up");
    });
    // This install's Postgres is still up from the killed run.
    expect(await runningContainers(first.root)).not.toBe("");

    const next = startIn(first.root, first.port, first.env);

    expect(
      JSON.parse(
        await eventually(() => get(next.port, "alpha.robkit.localhost")),
      ),
    ).toMatchObject({ slug: "alpha", database: true });
  });
});

describe("robkit-dev when Compose fails", () => {
  it("reports a failed compose up alone, not the compose stop after it", async () => {
    const { root, env } = await devInstall();
    // A Docker that answers the checks, then fails every other command,
    // as one that stops between the check and compose up does.
    const bin = await mkdtemp(join(tmpdir(), "docker-stand-in-"));
    await writeFile(
      join(bin, "docker"),
      [
        "#!/bin/sh",
        'case "$1 $2" in',
        '  "version "*|"compose ps"|"ps "*) exit 0 ;;',
        '  *) echo "Docker stopped" >&2; exit 1 ;;',
        "esac",
        "",
      ].join("\n"),
      { mode: 0o755 },
    );

    const running = runDev(root, {
      ...env,
      PATH: `${bin}:${String(env.PATH)}`,
    });

    await expect(running).rejects.toThrow(
      new CommandProblem(
        `docker compose up -d --wait exited with 1 in ${root}. Its output is above: fix what it says, then try again.`,
      ),
    );
  });
});
