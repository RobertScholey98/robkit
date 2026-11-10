import { createServer } from "node:net";
import { once } from "node:events";
import { freePort } from "@internal/test-postgres";
import { CommandProblem } from "@robkit/input/command";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { migrate } from "./migrate.ts";
import { serveCore } from "./serve-core.ts";
import { freshDatabase } from "./test/fresh-database.ts";

const coreUrl = "https://core.robkit.test";

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

  it("stops with the reader's message when a setting won't do", async () => {
    await expect(
      serveCore({
        DATABASE_URL: "postgres://core:pw@db:5432/robkit",
        ROBKIT_CORE_URL: coreUrl,
      }),
    ).rejects.toEqual(
      new CommandProblem(
        "PORT is not set. Set it to the port to listen on, a whole number from 1 to 65535.",
      ),
    );
  });

  it("throws what went wrong before it listens, such as a schema not migrated", async () => {
    await expect(
      serveCore({
        DATABASE_URL: await freshDatabase(),
        ROBKIT_CORE_URL: coreUrl,
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
        PORT: String(port),
      }),
    ).rejects.toThrow(/EADDRINUSE/);
  });
});
