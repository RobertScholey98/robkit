import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import {
  link as linkTo,
  mkdtemp,
  readFile,
  realpath,
  rm,
  utimes,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { freePort } from "@internal/test-postgres";
import postgres from "postgres";
import {
  describe,
  expect,
  inject,
  it,
  onTestFailed,
  onTestFinished,
  vi,
} from "vitest";
import { CommandProblem } from "@robkit/input/command";
import { migrate } from "./migrate.ts";
import { robkitCore } from "./robkit-core.ts";
import { freshDatabase } from "./test/fresh-database.ts";

const command = fileURLToPath(
  new URL("robkit-core-command.ts", import.meta.url),
);

/** The environment every run starts from: this one, without robkit's settings. */
const quiet = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) => !name.startsWith("ROBKIT_") && name !== "DATABASE_URL",
  ),
);

interface Run {
  pid: number;
  stdout: () => string;
  stderr: () => string;
  exited: Promise<number | null>;
  stop: () => void;
}

/**
 * Runs `robkit-core <args>` with `env` in its own process, as a container or
 * pnpm would. A test that reads what the serving process prints, or looks
 * at its environment, uses this.
 */
function spawnCore(args: string[], env: Record<string, string>): Run {
  const child = spawn(process.execPath, [command, ...args], {
    env: { ...quiet, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout: string[] = [];
  const stderr: string[] = [];
  child.stdout.on("data", (chunk: Buffer) => stdout.push(String(chunk)));
  child.stderr.on("data", (chunk: Buffer) => stderr.push(String(chunk)));
  const exited = once(child, "exit").then(([code]) => code as number | null);
  onTestFinished(() => {
    if (child.exitCode === null) child.kill("SIGKILL");
  });
  onTestFailed(() => {
    console.error(
      `robkit-core ${args.join(" ")} printed:
${stdout.join("")}${stderr.join("")}`,
    );
  });
  return {
    pid: child.pid ?? 0,
    stdout: () => stdout.join(""),
    stderr: () => stderr.join(""),
    exited,
    stop: () => child.kill("SIGTERM"),
  };
}

async function statusOf(port: number): Promise<number> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      return (await fetch(`http://127.0.0.1:${String(port)}/status`)).status;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

function inDatabase(url: string, name: string): string {
  const next = new URL(url);
  next.pathname = `/${name}`;
  return next.href;
}

/**
 * A new database with nothing in it, not even core's schema, as a fresh
 * host's Postgres. The core role exists already: roles belong to the whole
 * server, and the suite's setup made it.
 */
async function emptyDatabase(): Promise<{ admin: string; core: string }> {
  const name = `empty_${randomBytes(6).toString("hex")}`;
  const sql = postgres(inject("adminUrl"), { max: 1 });
  await sql.unsafe(`create database ${name}`).finally(() => sql.end());
  return {
    admin: inDatabase(inject("adminUrl"), name),
    core: inDatabase(inject("databaseUrl"), name),
  };
}

/** Rows `query` returns, as a superuser in the database at `url`. */
async function asAdmin(url: string, query: string): Promise<unknown[]> {
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    return [...(await sql.unsafe(query))];
  } finally {
    await sql.end();
  }
}

/** The provision step's settings, for the empty database at `admin`. */
function provisioning(admin: string, databases: string) {
  return {
    ROBKIT_ADMIN_DATABASE_URL: admin,
    ROBKIT_DB_SECRET: inject("databaseSecret"),
    ROBKIT_DATABASES: databases,
  };
}

const coreUrl = "https://core.robkit.test";

/**
 * Sends this process SIGTERM, as Docker would. Only a `robkit-core` a test
 * started in this process listens for it; the test runner doesn't.
 */
function sigterm(): void {
  process.emit("SIGTERM", "SIGTERM");
}

/** What `console.log` prints from here to the test's end, one entry per call. */
function logged(): () => unknown[] {
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  onTestFinished(() => {
    log.mockRestore();
  });
  return () => log.mock.calls.map(([line]) => line as unknown);
}

/** The variables whose presence the secrets test looks for. */
const watched = new Set([
  "DATABASE_URL",
  "ROBKIT_ADMIN_DATABASE_URL",
  "ROBKIT_DB_SECRET",
]);

describe("robkit-core migrate", () => {
  it("migrates core's database", async () => {
    const databaseUrl = await freshDatabase();

    const lines = logged();

    expect(await robkitCore(["migrate"], { DATABASE_URL: databaseUrl })).toBe(
      0,
    );
    expect(lines()).toEqual(["core migrated"]);
    expect(
      await asAdmin(
        inDatabase(inject("adminUrl"), new URL(databaseUrl).pathname.slice(1)),
        "select count(*)::int as n from core.signing_keys",
      ),
    ).toEqual([{ n: 0 }]);
  });
});

describe("robkit-core start", () => {
  it("skips the provision step without its settings, then migrates and serves until SIGTERM", async () => {
    const port = await freePort();
    const lines = logged();
    onTestFinished(sigterm);
    const run = robkitCore(["start"], {
      DATABASE_URL: await freshDatabase(),
      ROBKIT_CORE_URL: coreUrl,
      ROBKIT_APPS: "[]",
      PORT: String(port),
    });

    expect(await statusOf(port)).toBe(200);
    sigterm();

    expect(await run).toBe(0);
    // The serving process prints its own lines; serveCore's test reads them.
    expect(lines()).toEqual([
      "Skipping the provision step: ROBKIT_ADMIN_DATABASE_URL and ROBKIT_DB_SECRET aren't set.",
      "core migrated",
    ]);
  });

  it("provisions, migrates and serves, and the serving process holds neither secret", async () => {
    const database = await emptyDatabase();
    const port = await freePort();
    const run = spawnCore(["start"], {
      ...provisioning(database.admin, "core"),
      DATABASE_URL: database.core,
      ROBKIT_CORE_URL: coreUrl,
      ROBKIT_APPS: "[]",
      PORT: String(port),
    });

    expect(await statusOf(port)).toBe(200);

    const [serving] = (
      await readFile(
        `/proc/${String(run.pid)}/task/${String(run.pid)}/children`,
        "utf8",
      )
    )
      .trim()
      .split(" ");
    const namesIn = async (pid: string) =>
      (await readFile(`/proc/${pid}/environ`, "utf8"))
        .split("\0")
        .map((entry) => entry.split("=")[0])
        .filter((name) => name !== undefined && watched.has(name));
    expect({
      start: await namesIn(String(run.pid)),
      serving: await namesIn(serving ?? ""),
    }).toEqual({
      start: expect.arrayContaining([
        "DATABASE_URL",
        "ROBKIT_ADMIN_DATABASE_URL",
        "ROBKIT_DB_SECRET",
      ]) as string[],
      serving: ["DATABASE_URL"],
    });
    expect(run.stdout()).toContain("provisioned core\ncore migrated\n");
  });

  it("brings up two cores started together on an empty database, each thing made once", async () => {
    const database = await emptyDatabase();
    const apps = JSON.stringify([
      {
        slug: "twina",
        access: { kind: "roles", roles: ["Family", "Cooks"] },
      },
      { slug: "twinb" },
    ]);
    const ports = [await freePort(), await freePort()];

    // Both in this process, so the coverage report sees the provision step
    // and the migrator run. Each still serves from its own child process.
    const lines = logged();
    onTestFinished(sigterm);
    const runs = ports.map((port) =>
      robkitCore(["start"], {
        ...provisioning(database.admin, "core,twina,twinb"),
        DATABASE_URL: database.core,
        ROBKIT_CORE_URL: coreUrl,
        ROBKIT_APPS: apps,
        PORT: String(port),
      }),
    );

    expect(await Promise.all(ports.map(statusOf))).toEqual([200, 200]);
    sigterm();
    expect(await Promise.all(runs)).toEqual([0, 0]);
    // The two print in either order.
    expect(lines().map(String).toSorted()).toEqual([
      "core migrated",
      "core migrated",
      "provisioned core, twina, twinb",
      "provisioned core, twina, twinb",
    ]);
    expect({
      roles: await asAdmin(
        database.admin,
        "select rolname from pg_roles where rolname in ('core', 'twina', 'twinb') order by rolname",
      ),
      schemas: await asAdmin(
        database.admin,
        "select nspname from pg_namespace where nspname in ('core', 'twina', 'twinb') order by nspname",
      ),
      migrations: await asAdmin(
        database.admin,
        "select count(*)::int as runs, count(distinct hash)::int as migrations from core.__drizzle_migrations",
      ),
      apps: await asAdmin(
        database.admin,
        "select slug, access from core.apps order by slug",
      ),
      rule: await asAdmin(
        database.admin,
        "select r.name from core.app_roles a join core.roles r on r.id = a.role_id where a.app_slug = 'twina' order by r.name",
      ),
    }).toEqual({
      roles: [{ rolname: "core" }, { rolname: "twina" }, { rolname: "twinb" }],
      schemas: [
        { nspname: "core" },
        { nspname: "twina" },
        { nspname: "twinb" },
      ],
      migrations: [{ runs: 5, migrations: 5 }],
      apps: [
        { slug: "twina", access: "roles" },
        { slug: "twinb", access: "owner" },
      ],
      rule: [{ name: "Cooks" }, { name: "Family" }],
    });
  });

  it("exits 128 plus the signal's number when a signal kills the serving process", async () => {
    const port = await freePort();
    logged();
    onTestFinished(sigterm);
    const run = robkitCore(["start"], {
      DATABASE_URL: await freshDatabase(),
      ROBKIT_CORE_URL: coreUrl,
      ROBKIT_APPS: "[]",
      PORT: String(port),
    });
    expect(await statusOf(port)).toBe(200);

    const children = (
      await readFile(
        `/proc/${String(process.pid)}/task/${String(process.pid)}/children`,
        "utf8",
      )
    )
      .trim()
      .split(" ");
    const commands = await Promise.all(
      children.map((pid) => readFile(`/proc/${pid}/cmdline`, "utf8")),
    );
    const serving = children.filter((_, index) =>
      commands[index]?.includes("serving.ts"),
    );
    expect(serving).toHaveLength(1);
    process.kill(Number(serving[0]), "SIGKILL");

    // As a shell reports it, and as Docker does for a container it killed.
    expect(await run).toBe(137);
  });

  it("names an app it won't provision, with no stack, and exits 1", async () => {
    const database = await emptyDatabase();
    await asAdmin(database.admin, "create role overlord superuser");

    await expect(
      robkitCore(["start"], {
        ...provisioning(database.admin, "core,overlord"),
        DATABASE_URL: database.core,
        ROBKIT_CORE_URL: coreUrl,
        ROBKIT_APPS: "[]",
        PORT: "3000",
      }),
    ).rejects.toEqual(
      new CommandProblem(
        `robkit-core can't give overlord its database. "overlord" is a superuser in the install's database, so the provision step won't make it an app's role. Rename the app, or take it out of ROBKIT_DATABASES.`,
      ),
    );
  });

  it("names a secret too short to derive passwords from, and provisions nothing", async () => {
    const database = await emptyDatabase();

    await expect(
      robkitCore(["start"], {
        ...provisioning(database.admin, "shortsecret"),
        ROBKIT_DB_SECRET: "short",
        DATABASE_URL: database.core,
        ROBKIT_CORE_URL: coreUrl,
        ROBKIT_APPS: "[]",
        PORT: "3000",
      }),
    ).rejects.toEqual(
      new CommandProblem(
        "robkit-core can't derive the apps' database passwords. The database secret is 5 characters. It must be at least 32. Set ROBKIT_DB_SECRET to the install's secret.",
      ),
    );
    expect(
      await asAdmin(
        database.admin,
        "select rolname from pg_roles where rolname = 'shortsecret'",
      ),
    ).toEqual([]);
  });

  it("prints a fault storing its new signing key as a bug, without the key", async () => {
    const databaseUrl = await freshDatabase();
    await migrate(databaseUrl);
    await asAdmin(
      inDatabase(inject("adminUrl"), new URL(databaseUrl).pathname.slice(1)),
      "alter table core.signing_keys add constraint no_new_keys check (false) not valid",
    );

    const run = spawnCore(["start"], {
      DATABASE_URL: databaseUrl,
      ROBKIT_CORE_URL: coreUrl,
      ROBKIT_APPS: "[]",
      PORT: String(await freePort()),
    });

    expect(await run.exited).toBe(1);
    const printed = run.stderr();
    expect(printed).toContain("robkit hit a bug.");
    expect(printed).toContain('insert into "core"."signing_keys"');
    expect(printed).toContain("constraint_name: 'no_new_keys'");
    // The new key is a JWK: its private part is "d", on curve Ed25519.
    expect(printed).not.toContain('"d"');
    expect(printed).not.toContain("Ed25519");
    expect(printed).not.toContain("Failing row");
  });
});

describe("robkit-core serve", () => {
  it("restarts core when its source changes, in a checkout", async () => {
    const databaseUrl = await freshDatabase();
    await migrate(databaseUrl);
    const port = await freePort();
    const run = spawnCore(["serve"], {
      DATABASE_URL: databaseUrl,
      ROBKIT_CORE_URL: coreUrl,
      ROBKIT_APPS: "[]",
      PORT: String(port),
    });
    const listening = `core listening on 127.0.0.1:${String(port)}`;
    await expect.poll(run.stdout, { timeout: 30_000 }).toContain(listening);

    const now = new Date();
    await utimes(
      fileURLToPath(new URL("serve-core.ts", import.meta.url)),
      now,
      now,
    );

    await expect
      .poll(() => run.stdout().split(listening).length - 1, { timeout: 30_000 })
      .toBe(2);
    expect(await statusOf(port)).toBe(200);
    run.stop();
    expect(await run.exited).toBe(0);
  });

  it("keeps serving when a dependency gains a hard link, as every pnpm install on the machine gives it", async () => {
    const databaseUrl = await freshDatabase();
    await migrate(databaseUrl);
    const port = await freePort();
    const run = spawnCore(["serve"], {
      DATABASE_URL: databaseUrl,
      ROBKIT_CORE_URL: coreUrl,
      ROBKIT_APPS: "[]",
      PORT: String(port),
    });
    const listening = `core listening on 127.0.0.1:${String(port)}`;
    const starts = () => run.stdout().split(listening).length - 1;
    await expect.poll(starts, { timeout: 30_000 }).toBe(1);
    // A file core imports, in pnpm's store, and a folder on the same disk
    // to link it from.
    const dependency = await realpath(
      fileURLToPath(
        new URL("../node_modules/hono/dist/index.js", import.meta.url),
      ),
    );
    const elsewhere = await mkdtemp(
      fileURLToPath(new URL("../node_modules/.hard-link-", import.meta.url)),
    );
    onTestFinished(() => rm(elsewhere, { recursive: true, force: true }));

    await linkTo(dependency, join(elsewhere, "index.js"));
    // Node restarts a moment after a change, and takes a second change in
    // that moment for the same one. So a restart gets two seconds to show
    // before the change that must cause one. A watcher of everything core
    // imports had restarted core within one.
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    expect(starts()).toBe(1);
    // Then a change core does restart for, which shows it was watching.
    const now = new Date();
    await utimes(
      fileURLToPath(new URL("serve-core.ts", import.meta.url)),
      now,
      now,
    );

    await expect.poll(starts, { timeout: 30_000 }).toBe(2);
    // Node names each file whose change restarts core.
    expect(run.stdout() + run.stderr()).not.toContain(dependency);
    expect(await statusOf(port)).toBe(200);
    run.stop();
    expect(await run.exited).toBe(0);
  });
});
