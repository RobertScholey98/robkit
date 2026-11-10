import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { freePostgresPort } from "@internal/test-postgres";
import { describe, expect, it, onTestFinished } from "vitest";
import { CommandProblem, reportFaultsAt } from "@robkit/input/command";
import { runDev } from "./runner.ts";
import {
  createdContainers,
  devInstall,
  eventually,
  exitCode,
  get,
  isListening,
  runningContainers,
  startDev,
  startedApps,
  startIn,
  stopRunsAfterEach,
} from "./test/dev-run.ts";

stopRunsAfterEach();

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

  it("runs an app's migrate script with the app's own settings", async () => {
    const dev = await startDev();

    await eventually(() => get(dev.port, "alpha.robkit.localhost"));

    expect(
      JSON.parse(
        await readFile(
          join(dev.root, "apps", "alpha", "migrated-with.json"),
          "utf8",
        ),
      ),
    ).toEqual({ app: "alpha", port: String(dev.port + 1) });
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

  it("stops it all on SIGHUP with its output closed, as a closed terminal leaves it", async () => {
    const dev = await startDev();
    await eventually(() => get(dev.port, "alpha.robkit.localhost"));

    // A closed terminal closes the runner's output, then sends SIGHUP. The
    // apps print as they stop, so the runner writes to the closed output.
    dev.child.stdout?.destroy();
    dev.child.stderr?.destroy();
    dev.child.kill("SIGHUP");

    expect(await exitCode(dev.child)).toBe(0);
    expect(await isListening(dev.port)).toBe(false);
    expect(await isListening(dev.port + 1)).toBe(false);
    expect(await isListening(dev.port + 2)).toBe(false);
    expect(await runningContainers(dev.root)).toBe("");

    const next = startIn(dev.root, dev.port, dev.env);
    expect(
      JSON.parse(
        await eventually(() => get(next.port, "alpha.robkit.localhost")),
      ),
    ).toMatchObject({ slug: "alpha", database: true });
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

  // In this process too, so the coverage report sees the runner's other
  // ways to stop. The tests that run the command prove what it prints.
  it("stops it all on SIGHUP in this process", async () => {
    const { root, port, env } = await devInstall();
    onTestFinished(() => {
      process.emit("SIGHUP", "SIGHUP");
    });

    const running = runDev(root, env);
    await eventually(() => get(port, "alpha.robkit.localhost"));
    process.emit("SIGHUP", "SIGHUP");

    expect(await running).toBe(0);
    expect(await isListening(port + 1)).toBe(false);
    expect(await runningContainers(root)).toBe("");
  });

  it("stops it all and returns 1 when an app exits, in this process", async () => {
    const { root, port, env } = await devInstall();

    const running = runDev(root, {
      ...env,
      FIXTURE_CRASH: "beta",
      FIXTURE_SLOW_START: "alpha",
    });

    expect(await running).toBe(1);
    expect(await isListening(port + 1)).toBe(false);
    expect(await runningContainers(root)).toBe("");
  });

  it("throws why when an app can't start, in this process", async () => {
    const { root, env } = await devInstall();

    const running = runDev(root, { ...env, FIXTURE_REMOVE_APP: "beta" });

    await expect(running).rejects.toThrow(
      /^pnpm run dev couldn't start in \S+\/apps\/beta/,
    );
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
    // Something listens there, whether Docker publishes the port or
    // Postgres holds it on the host's network, as it does on CI.
    expect(await isListening(port)).toBe(true);
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
    expect({
      inShell: await isListening(inShell),
      inFile: await isListening(inFile),
    }).toEqual({ inShell: true, inFile: false });
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

describe("an app's own .env", () => {
  it("reaches the app and its migrate script, under the shell's values, and no other app, telemetry included", async () => {
    const dev = await startDev(
      { FIXTURE_SHADOWED: "from the shell" },
      async (root) => {
        await writeFile(
          join(root, "apps", "alpha", ".env"),
          [
            "FIXTURE_OWN=alpha's own",
            "FIXTURE_SHADOWED=from the file",
            "NEXT_TELEMETRY_DISABLED=0",
            "",
          ].join("\n"),
        );
      },
    );

    const alpha: unknown = JSON.parse(
      await eventually(() => get(dev.port, "alpha.robkit.localhost")),
    );
    const beta: unknown = JSON.parse(
      await eventually(() => get(dev.port, "beta.robkit.localhost")),
    );
    const migratedWith: unknown = JSON.parse(
      await readFile(
        join(dev.root, "apps", "alpha", "migrated-with.json"),
        "utf8",
      ),
    );

    expect(alpha).toMatchObject({
      own: "alpha's own",
      shadowed: "from the shell",
      nextTelemetry: "0",
    });
    expect(beta).not.toHaveProperty("own");
    expect(beta).toMatchObject({ nextTelemetry: "1" });
    expect(migratedWith).toMatchObject({ own: "alpha's own" });
  });

  it("stops pnpm dev before it starts anything when the file sets a name robkit decides", async () => {
    const dev = await startDev({}, async (root) => {
      await writeFile(join(root, "apps", "beta", ".env"), "PORT=4000\n");
    });

    expect(await exitCode(dev.child)).toBe(1);
    expect(dev.output()).toBe(
      "apps/beta/.env sets PORT, which pnpm dev decides for each app. Remove it from the file.\n",
    );
    expect(await startedApps(dev.root)).toEqual([]);
    expect(await createdContainers(dev.root)).toBe("");
  });
});

describe("robkit-dev's checks before it starts", () => {
  it("says to start Docker, in one line, and starts nothing when Docker doesn't answer", async () => {
    // A Docker that doesn't answer, rather than stopping this machine's.
    const dev = await startDev({
      DOCKER_HOST: "unix:///nonexistent/docker.sock",
    });

    expect(await exitCode(dev.child)).toBe(1);
    expect(dev.output()).toMatch(
      /^Docker isn't answering, and pnpm dev runs Postgres in it\. Start Docker, then run pnpm dev again\. Docker said: [^\n]*nonexistent\/docker\.sock[^\n]*\n$/,
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
    const slugs = ["alpha", "beta"];
    // Each app answers before the kill, so each has written its pid.
    for (const slug of slugs) {
      await eventually(() => get(first.port, `${slug}.robkit.localhost`));
    }

    first.child.kill("SIGKILL");
    await exitCode(first.child);
    for (const slug of slugs) {
      const pid = Number(
        await readFile(join(first.root, "apps", slug, "started"), "utf8"),
      );
      process.kill(pid, "SIGKILL");
    }
    for (const [index, slug] of slugs.entries()) {
      await eventually(async () => {
        if (await isListening(first.port + 1 + index)) {
          throw new Error(`${slug} is still up`);
        }
      });
    }
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
