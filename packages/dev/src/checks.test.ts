import { once } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { freePort, freePortBlock } from "@internal/test-postgres";
import { CommandProblem } from "@robkit/input/command";
import { afterEach, describe, expect, it } from "vitest";
import { checkBeforeStart, isTaken, portForNewApp } from "./checks.ts";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

/** Listens on `port` on 127.0.0.1 until the test ends, and returns the port. */
async function hold(port: number): Promise<number> {
  const server = createServer().listen(port, "127.0.0.1");
  servers.push(server);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return address.port;
}

/** A port something on 127.0.0.1 holds until the test ends. */
function heldPort(): Promise<number> {
  return hold(0);
}

// A test that needs a port to be free leases it. A port the OS picked for
// one server sits beside the ports it picks for every other test's, so its
// neighbours can be taken at any moment. On 2026-11-11 in CI, another
// test's server held the port three after the proxy's.
describe("isTaken", () => {
  it("says a port something listens on is taken, and a free one isn't", async () => {
    const held = await heldPort();
    const free = await freePort();

    expect(await isTaken(held, "127.0.0.1")).toBe(true);
    expect(await isTaken(free, "127.0.0.1")).toBe(false);
  });

  it("says an address the machine lacks holds nothing", async () => {
    // 2001:db8::/32 is for documentation, so no machine has it.
    expect(await isTaken(await heldPort(), "2001:db8::1")).toBe(false);
  });
});

describe("portForNewApp", () => {
  it("takes the first port after the proxy's that no app holds", async () => {
    const devPort = await freePortBlock(4);
    // Held, as the proxy holds its own.
    await hold(devPort);

    const port = await portForNewApp(devPort, [devPort + 1, devPort + 2]);

    expect(port).toBe(devPort + 3);
  });

  it("passes over a port something else listens on", async () => {
    const devPort = await freePortBlock(4);
    await hold(devPort + 2);

    const port = await portForNewApp(devPort, [devPort + 1]);

    expect(port).toBe(devPort + 3);
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

  /** What the check says with a script in docker's place that fails. */
  async function withDocker(script: string): Promise<unknown> {
    const bin = await mkdtemp(join(tmpdir(), "failing-docker-"));
    await writeFile(join(bin, "docker"), `#!/bin/sh\n${script}\nexit 1\n`, {
      mode: 0o755,
    });
    return checkBeforeStart({
      root: bin,
      env: { PATH: `${bin}:/usr/bin:/bin` },
      devPort: 1,
      postgresPort: 1,
      apps: [],
    }).catch((error: unknown) => error);
  }

  // A script stands in for docker, which Windows wouldn't run by that name.
  it.skipIf(process.platform === "win32")(
    "says what Docker said when it doesn't answer, since Docker may be running and refusing this account",
    async () => {
      const said =
        await withDocker(`echo "permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock." >&2
echo "A second line." >&2`);

      expect(said).toEqual(
        new CommandProblem(
          "Docker isn't answering, and pnpm dev runs Postgres in it. Start Docker, then run pnpm dev again. Docker said: permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock.",
        ),
      );
    },
  );

  it.skipIf(process.platform === "win32")(
    "says only to start Docker when Docker said nothing",
    async () => {
      expect(await withDocker("")).toEqual(
        new CommandProblem(
          "Docker isn't answering, and pnpm dev runs Postgres in it. Start Docker, then run pnpm dev again.",
        ),
      );
    },
  );
});
