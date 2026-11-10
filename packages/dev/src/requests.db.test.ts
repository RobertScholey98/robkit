import { existsSync } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { slug } from "@internal/test-session";
import postgres from "postgres";
import { describe, expect, it, onTestFinished } from "vitest";
import { askDev, devSocket, type DevOperation } from "./requests.ts";
import { runDev } from "./runner.ts";
import {
  createdContainers,
  devInstall,
  eventually,
  exitCode,
  get,
  isListening,
  startDev,
  startedApps,
  startIn,
  stopRunsAfterEach,
} from "./test/dev-run.ts";

stopRunsAfterEach();

const fixturePostgres = import.meta.resolve("postgres");

/** Writes an app at `apps/<name>` in the install at `root`, as robkit add does. */
async function writeApp(
  root: string,
  name: string,
  scripts: Record<string, string> = {
    dev: "node ../../serve.js",
    migrate: "node ../../migrate.js",
  },
): Promise<void> {
  await mkdir(join(root, "apps", name), { recursive: true });
  await writeFile(
    join(root, "apps", name, "package.json"),
    JSON.stringify({ name, private: true, type: "module", scripts }),
  );
}

/** What an app in the install at `root` wrote for a test to read. */
function readAppFile(root: string, name: string, file: string) {
  return readFile(join(root, "apps", name, file), "utf8");
}

/** Whether `url` still lets its role in, as an app's password would. */
async function connects(url: string): Promise<boolean> {
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    await sql`select 1`;
    return true;
  } catch {
    // The role's password changed, or it's gone.
    return false;
  } finally {
    await sql.end();
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    // ESRCH: no such process.
    return false;
  }
}

/**
 * robkit-dev, run in this process so the coverage report sees the runner,
 * with alpha and beta answering. It stops when the test ends.
 */
async function runningDev(
  env: NodeJS.ProcessEnv = {},
  prepare?: (root: string) => Promise<void>,
) {
  const install = await devInstall(prepare);
  const devEnv = { ...install.env, FIXTURE_POSTGRES: fixturePostgres, ...env };
  const running = runDev(install.root, devEnv);
  // A test that expects it to fail checks how; here it only must stop.
  const stopped = running.catch(() => undefined);
  onTestFinished(async () => {
    process.emit("SIGINT", "SIGINT");
    await stopped;
  });
  // A runner that stops before both apps answer, as when Compose fails,
  // fails the test with its own reason.
  await Promise.race([
    (async () => {
      await eventually(() => get(install.port, "alpha.robkit.localhost"));
      await eventually(() => get(install.port, "beta.robkit.localhost"));
    })(),
    running.then((code) => {
      throw new Error(
        `robkit-dev stopped with ${String(code)} before alpha and beta answered.`,
      );
    }),
  ]);
  const ask = (operation: DevOperation, name: string) =>
    askDev(install.root, { operation, slug: slug(name) }, devEnv);
  return { ...install, env: devEnv, running, ask };
}

describe("robkit-dev adding an app while it runs", () => {
  it("migrates, starts and routes the app, and leaves each running app on its port, though its slug sorts first", async () => {
    const dev = await runningDev();
    await writeApp(dev.root, "aardvark");

    const answer = await dev.ask("add", "aardvark");

    const origin = `http://aardvark.robkit.localhost:${String(dev.port)}`;
    expect(answer).toEqual({
      outcome: "done",
      message: `pnpm dev started aardvark at ${origin}.`,
    });
    expect(
      JSON.parse(await get(dev.port, "aardvark.robkit.localhost")),
    ).toMatchObject({
      slug: "aardvark",
      app: "aardvark",
      database: true,
      apps: JSON.stringify([
        { slug: "alpha" },
        { slug: "beta" },
        { slug: "aardvark" },
      ]),
    });
    expect(
      JSON.parse(await readAppFile(dev.root, "aardvark", "migrated-with.json")),
    ).toMatchObject({ app: "aardvark", port: String(dev.port + 3) });
    // Each app straight on its port, past the proxy.
    expect(JSON.parse(await get(dev.port + 1, "x"))).toMatchObject({
      slug: "alpha",
    });
    expect(JSON.parse(await get(dev.port + 2, "x"))).toMatchObject({
      slug: "beta",
    });
    expect(JSON.parse(await get(dev.port + 3, "x"))).toMatchObject({
      slug: "aardvark",
    });
  });

  it("keeps a running app answering, with its password, while an add migrates, and writing after", async () => {
    const dev = await runningDev({ FIXTURE_HOLD_MIGRATE: "aardvark" });
    const alphaUrl = await readAppFile(dev.root, "alpha", "migrated");
    await writeApp(dev.root, "aardvark");

    const adding = dev.ask("add", "aardvark");
    await eventually(() => readAppFile(dev.root, "aardvark", "migrating"));
    const alpha: unknown = JSON.parse(
      await get(dev.port, "alpha.robkit.localhost"),
    );
    const tables: unknown = JSON.parse(
      await get(dev.port, "alpha.robkit.localhost", "/tables"),
    );
    const connectsMidway = await connects(alphaUrl);
    await writeFile(join(dev.root, "apps", "aardvark", "go"), "");

    expect(await adding).toMatchObject({ outcome: "done" });
    expect(alpha).toMatchObject({ slug: "alpha" });
    expect({ tables, connectsMidway }).toEqual({
      tables: [],
      connectsMidway: true,
    });
    expect(await connects(alphaUrl)).toBe(true);
    expect(await get(dev.port, "alpha.robkit.localhost", "/visit")).toBe("1");
  });

  it("changes nothing on a second add for a running app", async () => {
    const dev = await runningDev();
    const alphaUrl = await readAppFile(dev.root, "alpha", "migrated");
    const alphaPid = await readAppFile(dev.root, "alpha", "started");

    const answer = await dev.ask("add", "alpha");

    expect(answer).toEqual({
      outcome: "done",
      message: `alpha is already running at http://alpha.robkit.localhost:${String(dev.port)}. pnpm dev changed nothing.`,
    });
    expect(await readAppFile(dev.root, "alpha", "migrated")).toBe(alphaUrl);
    expect(await readAppFile(dev.root, "alpha", "started")).toBe(alphaPid);
    expect(await connects(alphaUrl)).toBe(true);
    expect(
      JSON.parse(await get(dev.port, "alpha.robkit.localhost", "/tables")),
    ).toEqual([]);
  });

  it("gives an added app its own .env, and refuses one that sets names robkit decides", async () => {
    const dev = await runningDev();
    await writeApp(dev.root, "aardvark");
    const envFile = join(dev.root, "apps", "aardvark", ".env");
    await writeFile(envFile, "PORT=4000\nNODE_ENV=production\n");

    const refused = await dev.ask("add", "aardvark");
    await writeFile(envFile, "FIXTURE_OWN=aardvark's own\n");
    const added = await dev.ask("add", "aardvark");

    expect(refused).toEqual({
      outcome: "refused",
      message: [
        "apps/aardvark/.env sets NODE_ENV, which decides whether a test helper such as guardedAs() serves. Remove it from the file.",
        "apps/aardvark/.env sets PORT, which pnpm dev decides for each app. Remove it from the file.",
      ].join("\n"),
    });
    expect(added).toMatchObject({ outcome: "done" });
    expect(
      JSON.parse(await get(dev.port, "aardvark.robkit.localhost")),
    ).toMatchObject({ own: "aardvark's own" });
    expect(
      JSON.parse(await readAppFile(dev.root, "aardvark", "migrated-with.json")),
    ).toMatchObject({ own: "aardvark's own" });
  });

  it("refuses a folder with no package.json", async () => {
    const dev = await runningDev();
    await mkdir(join(dev.root, "apps", "aardvark"));

    expect(await dev.ask("add", "aardvark")).toEqual({
      outcome: "refused",
      message: "apps/aardvark has no package.json, so pnpm dev can't start it.",
    });
  });

  it("says why an added app's migration failed, and every other app keeps answering", async () => {
    const dev = await runningDev({ FIXTURE_FAIL_MIGRATE: "aardvark" });
    await writeApp(dev.root, "aardvark");

    const answer = await dev.ask("add", "aardvark");

    expect(answer).toEqual({
      outcome: "refused",
      message: `pnpm run migrate exited with 1 in ${join(dev.root, "apps", "aardvark")}. Its output is above: fix what it says, then try again.`,
    });
    expect(
      JSON.parse(await get(dev.port, "alpha.robkit.localhost")),
    ).toMatchObject({ slug: "alpha" });
  });

  it("says an added app exited before it answered, and every other app keeps answering", async () => {
    const dev = await runningDev();
    await writeApp(dev.root, "aardvark", { dev: `node -e "process.exit(2)"` });

    const answer = await dev.ask("add", "aardvark");

    expect(answer).toEqual({
      outcome: "refused",
      message:
        "aardvark exited with 2 before it answered. Its output is in pnpm dev's.",
    });
    expect(
      JSON.parse(await get(dev.port, "alpha.robkit.localhost")),
    ).toMatchObject({ slug: "alpha" });
  });

  it("stops everything once an added app that answered exits", async () => {
    const dev = await runningDev();
    await writeApp(dev.root, "aardvark");
    await dev.ask("add", "aardvark");

    process.kill(Number(await readAppFile(dev.root, "aardvark", "started")));

    expect(await dev.running).toBe(1);
    expect(await isListening(dev.port + 1)).toBe(false);
  });

  it("restarts core with the longer list, answering throughout, stopping its whole process group, and goes on running", async () => {
    const dev = await runningDev({}, (root) =>
      writeApp(root, "core", { dev: "node --watch ../../serve.js" }),
    );
    const core = "core.robkit.localhost";
    const before = {
      apps: (
        JSON.parse(await eventually(() => get(dev.port, core))) as {
          apps: string;
        }
      ).apps,
      pid: Number(await get(dev.port, core, "/pid")),
    };
    await writeApp(dev.root, "aardvark");

    // Core is asked through the proxy all through the add, as each app's
    // guard asks it for the app's rule.
    const adding = dev.ask("add", "aardvark");
    const finished = adding.then(
      () => true,
      () => true,
    );
    const coreAnswered = new Set<string>();
    do {
      coreAnswered.add(
        await get(dev.port, core, "/pid").then(
          () => "200",
          (error: unknown) => String(error),
        ),
      );
    } while (!(await Promise.race([finished, delay(20, false)])));
    const answer = await adding;

    expect(answer).toMatchObject({ outcome: "done" });
    expect(coreAnswered).toEqual(new Set(["200"]));
    expect(before.apps).toBe(
      JSON.stringify([{ slug: "alpha" }, { slug: "beta" }]),
    );
    expect(JSON.parse(await get(dev.port, core))).toMatchObject({
      apps: JSON.stringify([
        { slug: "alpha" },
        { slug: "beta" },
        { slug: "aardvark" },
      ]),
    });
    // The server Node's watcher ran is gone with its watcher.
    expect(isAlive(before.pid)).toBe(false);
    expect(
      JSON.parse(await get(dev.port, "alpha.robkit.localhost")),
    ).toMatchObject({ slug: "alpha" });
  });
});

describe("robkit-dev adding an app that can't start", () => {
  it("prints the problem, answers with it and keeps every other app answering", async () => {
    const dev = await startDev();
    await eventually(() => get(dev.port, "alpha.robkit.localhost"));
    await writeApp(dev.root, "aardvark", {
      dev: `node -e "console.error('broken on purpose'); process.exit(2)"`,
    });

    const answer = await askDev(
      dev.root,
      { operation: "add", slug: slug("aardvark") },
      dev.env,
    );

    const problem =
      "aardvark exited with 2 before it answered. Its output is in pnpm dev's.";
    expect(answer).toEqual({ outcome: "refused", message: problem });
    expect(dev.output()).toContain("[aardvark] broken on purpose\n");
    expect(dev.output()).toContain(
      `pnpm dev couldn't add aardvark. ${problem}\n`,
    );
    expect(dev.child.exitCode).toBe(null);
    expect(
      JSON.parse(await get(dev.port, "alpha.robkit.localhost")),
    ).toMatchObject({ slug: "alpha" });
    expect(
      await askDev(
        dev.root,
        { operation: "add", slug: slug("alpha") },
        dev.env,
      ),
    ).toMatchObject({ outcome: "done" });
  });
});

describe("robkit-dev migrating an app while it runs", () => {
  it("applies a migration written while it runs, and the app sees the table with its password unchanged", async () => {
    const dev = await runningDev();
    const alphaUrl = await readAppFile(dev.root, "alpha", "migrated");
    const alphaPid = await readAppFile(dev.root, "alpha", "started");
    await mkdir(join(dev.root, "apps", "alpha", "migrations"));
    await writeFile(
      join(dev.root, "apps", "alpha", "migrations", "0001_notes.sql"),
      "create table notes (body text);",
    );

    const answer = await dev.ask("migrate", "alpha");

    expect(answer).toEqual({
      outcome: "done",
      message: "pnpm dev migrated alpha.",
    });
    expect(
      JSON.parse(await get(dev.port, "alpha.robkit.localhost", "/tables")),
    ).toEqual(["notes"]);
    expect(await readAppFile(dev.root, "alpha", "migrated")).toBe(alphaUrl);
    expect(await readAppFile(dev.root, "alpha", "started")).toBe(alphaPid);
    expect(await connects(alphaUrl)).toBe(true);
  });

  it("stops a migration it is running when it stops, and answers that it stopped", async () => {
    // Alpha's migration finishes as pnpm dev starts, and waits after that.
    const dev = await runningDev({ FIXTURE_HOLD_MIGRATE: "alpha" }, (root) =>
      writeFile(join(root, "apps", "alpha", "go"), ""),
    );
    await rm(join(dev.root, "apps", "alpha", "go"));
    await rm(join(dev.root, "apps", "alpha", "migrating"));
    const migrating = dev.ask("migrate", "alpha");
    const pid = Number(
      await eventually(async () => {
        const text = await readAppFile(dev.root, "alpha", "migrating");
        if (text === "") throw new Error("The script hasn't written its pid.");
        return text;
      }),
    );

    // The signal reaches the runner alone, as a process manager's does.
    process.emit("SIGINT", "SIGINT");

    expect(await dev.running).toBe(0);
    expect(await migrating).toEqual({
      outcome: "refused",
      message:
        "pnpm dev stopped before it finished. Start it again, which starts every app in apps/.",
    });
    expect(isAlive(pid)).toBe(false);
  });

  it("stops an added app's migration when it stops", async () => {
    const dev = await runningDev({ FIXTURE_HOLD_MIGRATE: "aardvark" });
    await writeApp(dev.root, "aardvark");
    const adding = dev.ask("add", "aardvark");
    const pid = Number(
      await eventually(async () => {
        const text = await readAppFile(dev.root, "aardvark", "migrating");
        if (text === "") throw new Error("The script hasn't written its pid.");
        return text;
      }),
    );

    process.emit("SIGINT", "SIGINT");

    expect(await dev.running).toBe(0);
    expect(await adding).toMatchObject({ outcome: "refused" });
    expect(isAlive(pid)).toBe(false);
    expect(existsSync(join(dev.root, "apps", "aardvark", "started"))).toBe(
      false,
    );
  });

  it("refuses an app with no database, and one it isn't running", async () => {
    const dev = await runningDev();

    const beta = await dev.ask("migrate", "beta");
    const gamma = await dev.ask("migrate", "gamma");

    expect(beta).toEqual({
      outcome: "refused",
      message:
        "beta has no database: its package.json had no migrate script when pnpm dev started it. Add one, then start pnpm dev again.",
    });
    expect(gamma).toEqual({
      outcome: "refused",
      message:
        "pnpm dev isn't running gamma. Start pnpm dev again, which starts and migrates every app in apps/.",
    });
  });
});

describe("robkit-dev's socket", () => {
  it("refuses a socket folder others can open before it starts anything", async () => {
    const runtime = await mkdtemp(join(tmpdir(), "robkit-run-"));
    const folder = join(runtime, `robkit-${String(process.getuid?.())}`);
    await mkdir(folder);
    await chmod(folder, 0o755);

    const dev = await startDev({ XDG_RUNTIME_DIR: runtime });

    expect(await exitCode(dev.child)).toBe(1);
    expect(dev.output()).toBe(
      `pnpm dev keeps its socket in ${folder}, which others can open (mode 755). Run chmod 700 ${folder}, then run pnpm dev again.\n`,
    );
    expect(await startedApps(dev.root)).toEqual([]);
    expect(await createdContainers(dev.root)).toBe("");
  });

  it("removes its socket file when it stops", async () => {
    const dev = await startDev();
    await eventually(() => get(dev.port, "alpha.robkit.localhost"));
    const { path } = await devSocket(dev.root, dev.env);
    const whileRunning = existsSync(path);

    dev.child.kill("SIGINT");

    expect(await exitCode(dev.child)).toBe(0);
    expect({ whileRunning, afterStop: existsSync(path) }).toEqual({
      whileRunning: true,
      afterStop: false,
    });
  });

  it("isn't stopped by a socket file a killed run left, which askDev reads as no pnpm dev within a second", async () => {
    const first = await startDev();
    const slugs = ["alpha", "beta"];
    for (const name of slugs) {
      await eventually(() => get(first.port, `${name}.robkit.localhost`));
    }
    first.child.kill("SIGKILL");
    await exitCode(first.child);
    for (const name of slugs) {
      process.kill(
        Number(await readAppFile(first.root, name, "started")),
        "SIGKILL",
      );
    }
    for (const port of [first.port + 1, first.port + 2]) {
      await eventually(async () => {
        if (await isListening(port)) throw new Error(`${String(port)} is up`);
      });
    }
    const { path } = await devSocket(first.root, first.env);
    const asking = performance.now();

    const answer = await askDev(
      first.root,
      { operation: "add", slug: slug("alpha") },
      first.env,
    );

    expect(performance.now() - asking).toBeLessThan(1000);
    expect(answer).toEqual({ outcome: "not-running" });
    expect(existsSync(path)).toBe(true);

    const next = startIn(first.root, first.port, first.env);
    await eventually(() => get(next.port, "alpha.robkit.localhost"));
    expect(
      await askDev(
        first.root,
        { operation: "add", slug: slug("alpha") },
        first.env,
      ),
    ).toMatchObject({ outcome: "done" });
  });
});
