import { createServer } from "node:net";
import { once } from "node:events";
import { freePort } from "@internal/test-postgres";
import { CommandProblem } from "@robkit/input/command";
import postgres from "postgres";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { slug } from "@internal/test-session";
import { listApps, registerApps } from "./apps.ts";
import { createDatabase, type Database } from "./database.ts";
import { migrate } from "./migrate.ts";
import { serveCore } from "./serve-core.ts";
import { freshDatabase } from "./test/fresh-database.ts";

const coreUrl = "https://core.robkit.test";

/** Core's catalog in the database at `databaseUrl`, closed when the test ends. */
function catalog(databaseUrl: string): Database {
  const db = createDatabase(databaseUrl);
  onTestFinished(() => db.$client.end());
  return db;
}

/** The slugs in the catalog, in order. */
async function slugsIn(databaseUrl: string): Promise<string[]> {
  return (await listApps(catalog(databaseUrl))).map((app) => app.slug);
}

/** What `console.log` prints from here to the test's end, one entry per call. */
function logged(): () => unknown[] {
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  onTestFinished(() => {
    log.mockRestore();
  });
  return () => log.mock.calls.map(([line]) => line as unknown);
}

// serveCore runs in this process, so the coverage report sees it. Only the
// core a test starts here listens for SIGTERM; the test runner doesn't.
describe("serveCore", () => {
  it("serves core until SIGTERM, then closes its database and exits 0", async () => {
    const databaseUrl = await freshDatabase();
    await migrate(databaseUrl);
    const port = await freePort();
    const lines = logged();

    const served = serveCore({
      DATABASE_URL: databaseUrl,
      ROBKIT_CORE_URL: coreUrl,
      ROBKIT_APPS: "[]",
      PORT: String(port),
    });
    const listening = `core listening on 127.0.0.1:${String(port)}`;
    await expect.poll(lines).toContain(listening);
    const status = await fetch(`http://127.0.0.1:${String(port)}/status`);
    process.emit("SIGTERM", "SIGTERM");
    // A second signal, such as Ctrl+C reaching the whole process group, is
    // the same request.
    process.emit("SIGINT", "SIGINT");

    expect(status.status).toBe(200);
    expect(await served).toBe(0);
    expect(lines()).toEqual([listening, "core stopped"]);
  });

  // A query can outlive its request: the client gave up, or the stop's
  // limit closed its connection. Docker kills a container 10 seconds after
  // its signal, so core doesn't wait for one.
  it("stops while a query is still running, without waiting for it", async () => {
    const databaseUrl = await freshDatabase();
    await migrate(databaseUrl);
    const port = await freePort();
    const lines = logged();
    // Core logs the query it gave up on.
    const faults = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    onTestFinished(() => {
      faults.mockRestore();
    });
    const served = serveCore({
      DATABASE_URL: databaseUrl,
      ROBKIT_CORE_URL: coreUrl,
      ROBKIT_APPS: "[]",
      PORT: String(port),
    });
    const listening = `core listening on 127.0.0.1:${String(port)}`;
    await expect.poll(lines).toContain(listening);
    // Another session holds core.apps, so core's read of it waits.
    const other = postgres(databaseUrl, { max: 2, onnotice: () => undefined });
    const { promise: locked, resolve: lock } = Promise.withResolvers();
    const { promise: released, resolve: release } = Promise.withResolvers();
    const held = other.begin(async (sql) => {
      await sql`lock table core.apps in access exclusive mode`;
      lock(undefined);
      await released;
    });
    onTestFinished(async () => {
      release(undefined);
      await held;
      await other.end();
    });
    await locked;
    const gone = new AbortController();
    const asked = fetch(`http://127.0.0.1:${String(port)}/apps/notes/access`, {
      signal: gone.signal,
    }).then(
      () => "answered",
      () => "dropped",
    );
    await expect
      .poll(async () => {
        const [row] = await other<{ waiting: number }[]>`
          select count(*)::int as waiting from pg_locks
          where not granted and database =
            (select oid from pg_database where datname = current_database())`;
        return row?.waiting;
      })
      .toBe(1);
    // The client gives up, so no connection is left for the stop to wait on.
    gone.abort();
    expect(await asked).toBe("dropped");

    process.emit("SIGTERM", "SIGTERM");

    const stopped = await Promise.race([
      served,
      new Promise((resolve) =>
        setTimeout(resolve, 5000, "still waiting on its query"),
      ),
    ]);
    expect(stopped).toBe(0);
    expect(lines()).toEqual([listening, "core stopped"]);
  }, 20_000);

  it("stops with the reader's message when a setting won't do", async () => {
    await expect(
      serveCore({
        DATABASE_URL: "postgres://core:pw@db:5432/robkit",
        ROBKIT_CORE_URL: coreUrl,
        ROBKIT_APPS: "[]",
      }),
    ).rejects.toEqual(
      new CommandProblem(
        "PORT is not set. Set it to the port to listen on, a whole number from 1 to 65535.",
      ),
    );
  });

  // Core takes out every app the list leaves out, so a list it can't read
  // must stop it before it touches the catalog.
  it.each([
    ["missing", undefined, /^ROBKIT_APPS is not set\./],
    ["blank", " ", /^ROBKIT_APPS is not set\./],
    ["malformed", "notes", /^ROBKIT_APPS isn't valid JSON/],
  ])(
    "stops with a message when ROBKIT_APPS is %s, and changes nothing in the catalog",
    async (_, apps, message) => {
      const databaseUrl = await freshDatabase();
      await migrate(databaseUrl);
      await registerApps(catalog(databaseUrl), [{ slug: slug("notes") }]);

      const served = serveCore({
        DATABASE_URL: databaseUrl,
        ROBKIT_CORE_URL: coreUrl,
        PORT: String(await freePort()),
        ...(apps !== undefined && { ROBKIT_APPS: apps }),
      });

      await expect(served).rejects.toBeInstanceOf(CommandProblem);
      await expect(served).rejects.toThrow(message);
      expect(await slugsIn(databaseUrl)).toEqual(["notes"]);
    },
  );

  it("throws what went wrong before it listens, such as a schema not migrated", async () => {
    await expect(
      serveCore({
        DATABASE_URL: await freshDatabase(),
        ROBKIT_CORE_URL: coreUrl,
        ROBKIT_APPS: "[]",
        PORT: String(await freePort()),
      }),
    ).rejects.toThrow(/signing_keys/);
  });

  it("throws when its port is taken", async () => {
    const databaseUrl = await freshDatabase();
    await migrate(databaseUrl);
    const taken = createServer().listen(0, "127.0.0.1");
    await once(taken, "listening");
    onTestFinished(() => {
      taken.close();
    });
    const address = taken.address();
    const port = typeof address === "object" && address ? address.port : 0;
    logged();

    await expect(
      serveCore({
        DATABASE_URL: databaseUrl,
        ROBKIT_CORE_URL: coreUrl,
        ROBKIT_APPS: "[]",
        PORT: String(port),
      }),
    ).rejects.toThrow(/EADDRINUSE/);
  });
});
