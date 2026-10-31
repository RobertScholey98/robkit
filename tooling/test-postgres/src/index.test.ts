import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { createServer } from "node:net";
import { freePortBlock, startPostgres } from "./index.ts";

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
