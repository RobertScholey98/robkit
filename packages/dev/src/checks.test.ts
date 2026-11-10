import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkBeforeStart, isTaken } from "./checks.ts";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

/** A port something on 127.0.0.1 holds until the test ends. */
async function heldPort(): Promise<number> {
  const server = createServer().listen(0, "127.0.0.1");
  servers.push(server);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return address.port;
}

describe("isTaken", () => {
  it("says a port something listens on is taken, and a free one isn't", async () => {
    const held = await heldPort();
    const freed = createServer().listen(0, "127.0.0.1");
    await once(freed, "listening");
    const free = (freed.address() as AddressInfo).port;
    freed.close();
    await once(freed, "close");

    expect(await isTaken(held, "127.0.0.1")).toBe(true);
    expect(await isTaken(free, "127.0.0.1")).toBe(false);
  });

  it("says an address the machine lacks holds nothing", async () => {
    // 2001:db8::/32 is for documentation, so no machine has it.
    expect(await isTaken(await heldPort(), "2001:db8::1")).toBe(false);
  });
});

describe("checkBeforeStart", () => {
  it("says to install Docker when docker isn't on the PATH", async () => {
    const empty = await mkdtemp(join(tmpdir(), "no-docker-"));

    const checked = checkBeforeStart({
      root: empty,
      env: { PATH: empty, Path: empty },
      devPort: 1,
      postgresPort: 1,
      apps: [],
    });

    await expect(checked).rejects.toThrow(
      "Docker isn't installed, or isn't on your PATH, and pnpm dev runs Postgres in it. Install Docker, then run pnpm dev again.",
    );
  });
});
