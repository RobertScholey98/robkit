import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { freePort } from "@internal/test-postgres";
import postgres from "postgres";
import { afterAll, afterEach, describe, expect, inject, it } from "vitest";

const admin = postgres(inject("adminUrl"), { max: 1 });
const children: ChildProcess[] = [];

afterEach(() => {
  for (const child of children.splice(0)) child.kill();
});

afterAll(async () => {
  await admin.end();
});

function start(script: string, env: Record<string, string>): ChildProcess {
  const child = spawn(process.execPath, [script], {
    cwd: new URL("..", import.meta.url),
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

function boot(port: number, env: Record<string, string> = {}): ChildProcess {
  return start("src/main.ts", {
    PORT: String(port),
    DATABASE_URL: inject("databaseUrl"),
    ROBKIT_DOMAIN: "robkit.localhost",
    ...env,
  });
}

// These run in order on one database: core first meets it unmigrated.
describe("apps/core", () => {
  it("won't start, and doesn't migrate, before core's schema exists", async () => {
    const core = boot(await freePort());
    const [code] = (await once(core, "exit")) as [number | null];

    expect(code).toBe(1);
    expect(await coreTables()).toEqual([]);
  });

  it("migrates core's schema as a separate step", async () => {
    const migrate = start("src/migrate.ts", {
      DATABASE_URL: inject("databaseUrl"),
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
