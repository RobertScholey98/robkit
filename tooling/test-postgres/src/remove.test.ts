import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import {
  mkdir,
  mkdtemp,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, onTestFinished } from "vitest";
import { removeWhenGone } from "./clean-up.ts";
import { alive, removeAll, removeLeftover } from "./remove.ts";

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

  it("finds a tagged process in a process list longer than a megabyte", async () => {
    const tag = `test-${randomBytes(4).toString("hex")}`;
    // ps prints each process's environment, so 12 processes with 100 kB of
    // it each make the list longer than execFileSync's default buffer.
    for (let i = 0; i < 12; i++) {
      const padded = spawn("sh", ["-c", "sleep 600"], {
        env: { ...process.env, PADDING: "x".repeat(100_000) },
        stdio: "ignore",
      });
      onTestFinished(() => {
        padded.kill("SIGKILL");
      });
    }
    const exited = taggedShell(tag, "sleep 600");

    await removeLeftover({ tagged: tag }, 5_000);

    expect(await exited).toEqual([null, "SIGTERM"]);
  });

  it("removes a temp folder and what is in it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-test-folder-"));
    await mkdir(join(dir, "apps"));
    await writeFile(join(dir, "apps", "notes.md"), "# Notes\n");

    await removeLeftover({ path: dir });

    await expect(stat(dir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("releases the leases its owner holds, and no one else's", async () => {
    const leases = await mkdtemp(join(tmpdir(), "robkit-test-leases-"));
    onTestFinished(() => rm(leases, { recursive: true, force: true }));
    await symlink("111", join(leases, "20000"));
    await symlink("222", join(leases, "20020"));
    await symlink("111", join(leases, "20040"));
    await writeFile(join(leases, "notes.md"), "Not a lease.\n");

    await removeLeftover({ leases, owner: 111 });

    expect((await readdir(leases)).sort()).toEqual(["20020", "notes.md"]);
  });
});

describe("removeAll", () => {
  it("removes every leftover it can, then throws for those it couldn't", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-test-folder-"));
    const missing = join(dir, "no-such-leases");
    const after = await mkdtemp(join(tmpdir(), "robkit-test-folder-"));

    const removing = removeAll([
      { leases: missing, owner: 1 },
      { path: after },
    ]);

    await expect(removing).rejects.toMatchObject({
      errors: [expect.objectContaining({ code: "ENOENT", path: missing })],
    });
    await expect(stat(after)).rejects.toMatchObject({ code: "ENOENT" });
    await rm(dir, { recursive: true });
  });
});
