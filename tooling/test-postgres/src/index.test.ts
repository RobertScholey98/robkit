import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import postgres from "postgres";
import { describe, expect, it, onTestFinished } from "vitest";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import {
  freePortBlock,
  publishedPorts,
  removeWhenGone,
  startPostgres,
  testComposeFiles,
} from "./index.ts";

const run = promisify(execFile);
const index = fileURLToPath(new URL("./index.ts", import.meta.url));

async function selectOne(url: string): Promise<unknown> {
  const sql = postgres(url, { max: 1, connect_timeout: 2 });
  try {
    const [row] = await sql`select 1 as one`;
    return row?.one;
  } finally {
    await sql.end();
  }
}

describe("startPostgres", () => {
  it("starts a Postgres that is gone after stop", async () => {
    const { adminUrl, stop } = await startPostgres();
    try {
      expect(await selectOne(adminUrl)).toBe(1);
    } finally {
      await stop();
    }
    await expect(selectOne(adminUrl)).rejects.toThrow();
  });

  it("gives each caller its own Postgres", async () => {
    const [a, b] = await Promise.all([startPostgres(), startPostgres()]);
    try {
      expect(a.adminUrl).not.toBe(b.adminUrl);
      expect(await selectOne(a.adminUrl)).toBe(1);
      expect(await selectOne(b.adminUrl)).toBe(1);
    } finally {
      await Promise.all([a.stop(), b.stop()]);
    }
  });
});

describe("a test Postgres", () => {
  it("keeps its database in memory, off the disk", async () => {
    const { project, stop } = await startPostgres();
    try {
      const { stdout } = await run("docker", [
        "inspect",
        "--format",
        "{{range .Mounts}}{{.Type}} {{.Destination}}{{println}}{{end}}",
        `${project}-postgres-1`,
      ]);
      expect(stdout.trim()).toBe("tmpfs /var/lib/postgresql");
    } finally {
      await stop();
    }
  });
});

// Each path gets its own env, so coverage is the same whether or not the
// machine running the tests sets COMPOSE_FILE. CI sets it; WSL doesn't.
describe("testComposeFiles", () => {
  const inMemory = fileURLToPath(new URL("../in-memory.yaml", import.meta.url));

  it("adds in-memory.yaml to the install's compose.yaml", () => {
    expect(testComposeFiles({})).toBe(`compose.yaml:${inMemory}`);
  });

  it("adds in-memory.yaml to the files COMPOSE_FILE already names", () => {
    expect(testComposeFiles({ COMPOSE_FILE: "compose.yaml:host.yaml" })).toBe(
      `compose.yaml:host.yaml:${inMemory}`,
    );
  });
});

describe("publishedPorts", () => {
  // A container of its own rather than startPostgres(), since CI runs that on
  // the host network, where it publishes no port.
  it("lists the port a running container publishes", async () => {
    const name = `robkit-test-ports${randomBytes(3).toString("hex")}`;
    removeWhenGone({ docker: name });
    await run("docker", [
      "run",
      "-d",
      "--name",
      name,
      "-p",
      "127.0.0.1::5432",
      "postgres:18-alpine",
      "sleep",
      "600",
    ]);
    try {
      const { stdout } = await run("docker", ["port", name, "5432"]);
      const port = Number(stdout.trim().split(":").at(-1));
      expect(port).toBeGreaterThan(0);
      expect(await publishedPorts()).toContain(port);
    } finally {
      await run("docker", ["rm", "-f", "-v", name]);
    }
  });
});

/**
 * A stand-in for a test worker that asks for `count` port blocks of
 * `size`, leased in `leases`, prints each block's first port as one JSON
 * list, then waits to be killed.
 */
function blockAsker(leases: string, count: number, size: number) {
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
      import { freePortBlock } from ${JSON.stringify(index)};
      const firsts = [];
      for (let i = 0; i < ${String(count)}; i++) {
        firsts.push(await freePortBlock(${String(size)}, ${JSON.stringify(leases)}));
      }
      console.log(JSON.stringify(firsts));
      setInterval(() => {}, 1000);
      `,
    ],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  onTestFinished(() => {
    child.kill("SIGKILL");
  });
  const firsts = once(child.stdout, "data").then(
    ([data]: unknown[]) => JSON.parse(String(data)) as number[],
  );
  return { child, firsts };
}

async function eventually(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("never happened");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

describe("freePortBlock", () => {
  it("never gives two processes overlapping blocks", async () => {
    const leases = await mkdtemp(join(tmpdir(), "robkit-test-leases-"));
    onTestFinished(() => rm(leases, { recursive: true, force: true }));

    // 2 × 120 blocks of 20 from the 500 there are: picked at random without
    // a lease, some would overlap.
    const [a, b] = await Promise.all([
      blockAsker(leases, 120, 20).firsts,
      blockAsker(leases, 120, 20).firsts,
    ]);

    const ports = [...a, ...b].flatMap((first) =>
      Array.from({ length: 20 }, (_, i) => first + i),
    );
    expect(new Set(ports).size).toBe(ports.length);
  });

  it("clears the leases of a process that was killed", async () => {
    const leases = await mkdtemp(join(tmpdir(), "robkit-test-leases-"));
    onTestFinished(() => rm(leases, { recursive: true, force: true }));
    const asker = blockAsker(leases, 2, 3);
    const firsts = await asker.firsts;
    expect((await readdir(leases)).sort()).toEqual(firsts.map(String).sort());

    asker.child.kill("SIGKILL");

    await eventually(async () => (await readdir(leases)).length === 0);
  });

  it("finds consecutive ports that can all be listened on", async () => {
    const first = await freePortBlock(3);
    const servers = [first, first + 1, first + 2].map((port) =>
      createServer().listen(port, "127.0.0.1"),
    );
    try {
      await Promise.all(
        servers.map(
          (server) =>
            new Promise((resolve, reject) => {
              server.once("listening", resolve).once("error", reject);
            }),
        ),
      );
    } finally {
      for (const server of servers) server.close();
    }
  });
});
