import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const cleanUp = fileURLToPath(new URL("./clean-up.ts", import.meta.url));

async function containerNames(prefix: string): Promise<string[]> {
  const { stdout } = await run("docker", [
    "ps",
    "-a",
    "--format",
    "{{.Names}}",
  ]);
  return stdout.split("\n").filter((name) => name.startsWith(prefix));
}

function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function eventually(check: () => Promise<boolean> | boolean) {
  const deadline = Date.now() + 30_000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("never happened");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

describe("removeWhenGone", () => {
  it("removes a killed test's containers and process groups", async () => {
    const prefix = `robkit-test-gone${randomBytes(3).toString("hex")}`;
    // A stand-in for a test worker: starts a container and a detached process
    // group, registers both, then waits to be killed.
    const owner = spawn(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
        import { execFileSync, spawn } from "node:child_process";
        import { removeWhenGone } from ${JSON.stringify(cleanUp)};
        execFileSync("docker", ["run", "-d", "--name", ${JSON.stringify(`${prefix}-postgres-1`)}, "postgres:18-alpine", "sleep", "600"]);
        const dev = spawn("sleep", ["600"], { detached: true, stdio: "ignore" });
        removeWhenGone({ group: dev.pid }, { docker: ${JSON.stringify(prefix)} });
        console.log(dev.pid);
        setInterval(() => {}, 1000);
        `,
      ],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    const [line] = (await once(owner.stdout, "data")) as [Buffer];
    const group = Number(line.toString().trim());

    expect(await containerNames(prefix)).toEqual([`${prefix}-postgres-1`]);
    expect(groupAlive(group)).toBe(true);

    owner.kill("SIGKILL");

    await eventually(async () => (await containerNames(prefix)).length === 0);
    await eventually(() => !groupAlive(group));
  });
});
