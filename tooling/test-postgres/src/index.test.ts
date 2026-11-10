import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { chmod, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
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
        firsts.push(await freePortBlock(${String(size)}, { leases: ${JSON.stringify(leases)} }));
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

  it("gives up after 50 tries when every block is leased", async () => {
    const leases = await mkdtemp(join(tmpdir(), "robkit-test-leases-"));
    onTestFinished(() => rm(leases, { recursive: true, force: true }));
    for (let first = 20_000; first < 30_000; first += 20) {
      await symlink("1", join(leases, String(first)));
    }

    await expect(freePortBlock(3, { leases })).rejects.toThrow(
      `No free block of 3 ports in 50 tries. Check what is listening between 20000 and 30000, and the leases in ${leases}.`,
    );
  });

  it("keeps a block whose port something else has, and tries another", async () => {
    const leases = await mkdtemp(join(tmpdir(), "robkit-test-leases-"));
    onTestFinished(() => rm(leases, { recursive: true, force: true }));
    // This process leases a block for real, so no other suite has it, and
    // listens on its first port, as something outside the tests might.
    const taken = await freePortBlock(3);
    const server = createServer().listen(taken, "127.0.0.1");
    onTestFinished(() => {
      server.close();
    });
    await once(server, "listening");
    const free = await freePortBlock(3);
    const picks = [taken, taken, free].map((first) => (first - 20_000) / 20);

    const first = await freePortBlock(3, {
      leases,
      pick: () => picks.shift() ?? 0,
    });

    expect(first).toBe(free);
    expect((await readdir(leases)).sort()).toEqual(
      [String(taken), String(free)].sort(),
    );
  });

  it("refuses a block longer than 20 ports", async () => {
    await expect(freePortBlock(21)).rejects.toThrow(
      "A port block holds at most 20 ports, not 21.",
    );
  });

  it("fails when it can't write a lease", async () => {
    const leases = await mkdtemp(join(tmpdir(), "robkit-test-leases-"));
    onTestFinished(() => rm(leases, { recursive: true, force: true }));
    await chmod(leases, 0o500);
    onTestFinished(() => chmod(leases, 0o700));

    await expect(freePortBlock(3, { leases })).rejects.toMatchObject({
      code: "EACCES",
    });
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

  it("sets one watcher on a leases folder, however many ask at once", async () => {
    const leases = await mkdtemp(join(tmpdir(), "robkit-test-leases-"));
    onTestFinished(() => rm(leases, { recursive: true, force: true }));

    await Promise.all([
      freePortBlock(3, { leases }),
      freePortBlock(3, { leases }),
    ]);

    // A watcher's command line holds the folder it watches.
    const { stdout } = await run("ps", ["axww", "-o", "command="], {
      maxBuffer: 256 * 1024 * 1024,
    });
    const watchers = stdout
      .split("\n")
      .filter((line) => line.includes("watcher.ts") && line.includes(leases));
    expect(watchers).toHaveLength(1);
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
