import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import {
  freePort,
  startPostgres,
  type TestPostgres,
} from "@internal/test-postgres";
import { provisionDatabases } from "@robkit/provision";
import postgres from "postgres";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  inject,
  it,
} from "vitest";
let database: TestPostgres;
let admin: postgres.Sql;
/** Core's own `DATABASE_URL`, connecting as the core role. */
let databaseUrl: string;
const children: ChildProcess[] = [];

beforeAll(async () => {
  database = await startPostgres();
  admin = postgres(database.adminUrl, { max: 1 });
  const secret = "core's test database secret, not a real one";
  const provisioned = await provisionDatabases({
    adminUrl: database.adminUrl,
    secret,
    slugs: ["core"],
  });
  const url =
    provisioned.outcome === "provisioned"
      ? provisioned.databaseUrls.get("core")
      : undefined;
  if (url === undefined) {
    throw new Error("Couldn't provision core's database.", {
      cause: provisioned,
    });
  }
  databaseUrl = url;
});

afterEach(() => {
  for (const child of children.splice(0)) child.kill();
});

afterAll(async () => {
  await admin.end();
  await database.stop();
});

/** Runs `robkit-core <command>` in the install's apps/core, as its scripts do. */
function start(command: string, env: Record<string, string>): ChildProcess {
  const dir = join(inject("installs").start, "apps/core");
  const child = spawn(join(dir, "node_modules/.bin/robkit-core"), [command], {
    cwd: dir,
    env: { ...process.env, ...env },
    stdio: ["ignore", "inherit", "inherit"],
  });
  children.push(child);
  return child;
}

async function statusOf(port: number, host = "127.0.0.1"): Promise<number> {
  const deadline = Date.now() + 20_000;
  for (;;) {
    try {
      return (await fetch(`http://${host}:${String(port)}/status`)).status;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

async function coreTables(): Promise<string[]> {
  const rows = await admin<{ name: string }[]>`
    select tablename as name from pg_tables where schemaname = 'core'`;
  return rows.map((row) => row.name);
}

async function signingKeyIds(): Promise<string[]> {
  const rows = await admin<
    { kid: string }[]
  >`select kid from core.signing_keys`;
  return rows.map((row) => row.kid);
}

/**
 * Starts core as its container does, without the provision step's
 * settings: `start` migrates core's database, then serves.
 */
function boot(port: number, env: Record<string, string> = {}): ChildProcess {
  return start("start", {
    PORT: String(port),
    DATABASE_URL: databaseUrl,
    ROBKIT_CORE_URL: "http://core.robkit.localhost:3000",
    ROBKIT_APPS: "[]",
    ...env,
  });
}

// These run in order on one database: core first meets it unmigrated.
describe("the default install's apps/core", () => {
  it("migrates core's schema as a separate step", async () => {
    expect(await coreTables()).toEqual([]);

    const migrate = start("migrate", {
      DATABASE_URL: databaseUrl,
    });
    const [code] = (await once(migrate, "exit")) as [number | null];

    expect(code).toBe(0);
    expect(await coreTables()).toContain("__drizzle_migrations");
  });

  it("creates its signing key on first boot and keeps it after", async () => {
    const firstPort = await freePort();
    const first = boot(firstPort);
    expect(await statusOf(firstPort)).toBe(200);
    const afterFirstBoot = await signingKeyIds();
    first.kill();
    await once(first, "exit");

    const secondPort = await freePort();
    boot(secondPort);
    expect(await statusOf(secondPort)).toBe(200);

    expect(afterFirstBoot).toHaveLength(1);
    expect(await signingKeyIds()).toEqual(afterFirstBoot);
  });

  it("adds the apps in ROBKIT_APPS to its catalog with the rules they declare", async () => {
    const port = await freePort();
    boot(port, {
      ROBKIT_APPS: JSON.stringify([
        { slug: "example" },
        { slug: "notes", access: { kind: "open" }, icon: "📝" },
      ]),
    });
    expect(await statusOf(port)).toBe(200);

    const access = await Promise.all(
      ["example", "notes", "other"].map(async (slug) => {
        const res = await fetch(
          `http://127.0.0.1:${String(port)}/apps/${slug}/access`,
        );
        return [slug, res.status, await res.json()] as const;
      }),
    );

    expect(access).toEqual([
      ["example", 200, { kind: "owner" }],
      ["notes", 200, { kind: "open" }],
      ["other", 404, { error: "Not found" }],
    ]);
  });

  it("listens on 127.0.0.1 only, so the proxy is the way in", async () => {
    const port = await freePort();
    boot(port);

    expect(await statusOf(port)).toBe(200);
    await expect(
      fetch(`http://[::1]:${String(port)}/status`),
    ).rejects.toThrow();
  });

  it("listens where HOST says, as a container needs", async () => {
    const port = await freePort();
    boot(port, { HOST: "::" });

    expect(await statusOf(port, "[::1]")).toBe(200);
  });
});
