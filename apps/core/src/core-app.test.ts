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

async function statusOf(port: number): Promise<number> {
  const deadline = Date.now() + 20_000;
  for (;;) {
    try {
      return (await fetch(`http://127.0.0.1:${String(port)}/status`)).status;
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

describe("apps/core", () => {
  it("serves core on PORT without migrating", async () => {
    const port = await freePort();
    start("src/main.ts", {
      PORT: String(port),
      DATABASE_URL: inject("databaseUrl"),
    });

    expect(await statusOf(port)).toBe(200);
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
});
