import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { promisify } from "node:util";
import { describe, expect, it, onTestFinished } from "vitest";
import { removeWhenGone } from "./clean-up.ts";
import { alive, removeLeftover } from "./remove.ts";

const run = promisify(execFile);

async function lines(...args: string[]): Promise<string[]> {
  const { stdout } = await run("docker", args);
  return stdout.split("\n").filter(Boolean);
}

/** What Docker has named after `prefix`, and the neighbour that isn't. */
async function named(prefix: string): Promise<string[]> {
  const mine = (name: string) => name.startsWith(prefix);
  return [
    ...(await lines("ps", "-a", "--format", "{{.Names}}")).filter(mine),
    ...(await lines("network", "ls", "--format", "{{.Name}}")).filter(mine),
    ...(await lines("volume", "ls", "--format", "{{.Name}}")).filter(mine),
    ...(await lines("images", "--format", "{{.Repository}}")).filter(mine),
  ].sort();
}

/** A tagged `sh` that runs `script`, and how it ends. */
function taggedShell(tag: string, script: string) {
  const child = spawn("sh", ["-c", script], {
    env: { ...process.env, ROBKIT_TEST_TAG: tag },
    stdio: "ignore",
  });
  onTestFinished(() => {
    child.kill("SIGKILL");
  });
  return once(child, "exit");
}

describe("alive", () => {
  it("is true for a running process", () => {
    expect(alive(process.pid)).toBe(true);
  });

  it("is true for a process it may not signal", () => {
    expect(alive(1)).toBe(true);
  });

  it("is false once a process has exited", async () => {
    const child = spawn(process.execPath, ["-e", ""]);
    await once(child, "exit");
    expect(alive(child.pid ?? 0)).toBe(false);
  });
});

describe("removeLeftover", () => {
  it("removes the containers, networks, volumes and images a prefix names", async () => {
    const prefix = `robkit-test-rm${randomBytes(3).toString("hex")}`;
    const neighbour = `${prefix}x-postgres-1`;
    removeWhenGone({ docker: prefix });
    onTestFinished(async () => {
      await run("docker", ["rm", "-f", neighbour]);
    });
    const sleeper = ["postgres:18-alpine", "sleep", "600"];
    await run("docker", ["network", "create", `${prefix}_default`]);
    await run("docker", ["volume", "create", `${prefix}_data`]);
    await run("docker", [
      ...["run", "-d", "--name", `${prefix}-postgres-1`],
      ...["--network", `${prefix}_default`, "-v", `${prefix}_data:/data`],
      ...sleeper,
    ]);
    await run("docker", ["run", "-d", "--name", neighbour, ...sleeper]);
    await run("docker", ["tag", "postgres:18-alpine", `${prefix}/app`]);
    expect(await named(prefix)).toHaveLength(5);

    await removeLeftover({ docker: prefix });

    expect(await named(prefix)).toEqual([neighbour]);
  });

  it("does nothing when a prefix names nothing", async () => {
    const prefix = `robkit-test-none${randomBytes(3).toString("hex")}`;
    await removeLeftover({ docker: prefix });
    expect(await named(prefix)).toEqual([]);
  });

  it("stops a tagged process with SIGTERM", async () => {
    const tag = `test-${randomBytes(4).toString("hex")}`;
    const exited = taggedShell(tag, "sleep 600");
    await removeLeftover({ tagged: tag }, 5_000);
    expect(await exited).toEqual([null, "SIGTERM"]);
  });

  it("kills a tagged process that ignores SIGTERM once its grace is up", async () => {
    const tag = `test-${randomBytes(4).toString("hex")}`;
    const exited = taggedShell(tag, "trap '' TERM; sleep 600");
    await removeLeftover({ tagged: tag }, 500);
    expect(await exited).toEqual([null, "SIGKILL"]);
  });
});
