import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { createServer } from "node:net";
import {
  freePortBlock,
  publishedPorts,
  removeWhenGone,
  startPostgres,
} from "./index.ts";

const run = promisify(execFile);

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

describe("freePortBlock", () => {
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
