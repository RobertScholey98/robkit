import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const cleanUp = fileURLToPath(new URL("./clean-up.ts", import.meta.url));

async function imageNames(prefix: string): Promise<string[]> {
  const { stdout } = await run("docker", [
    "images",
    "--format",
    "{{.Repository}}",
  ]);
  return stdout.split("\n").filter((name) => name.startsWith(`${prefix}/`));
}

async function containerNames(prefix: string): Promise<string[]> {
  const { stdout } = await run("docker", [
    "ps",
    "-a",
    "--format",
    "{{.Names}}",
  ]);
  return stdout.split("\n").filter((name) => name.startsWith(prefix));
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    // Signal 0 throws only when the process is gone.
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
  it("removes a killed test's containers, images and every process it tagged", async () => {
    const prefix = `robkit-test-gone${randomBytes(3).toString("hex")}`;
    // A stand-in for a test worker. It starts a container, and a tagged
    // parent that starts an app in a session of its own and then dies, as
    // robkit-dev can when its worker is killed. Then it waits to be killed.
    const owner = spawn(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
        import { execFileSync, spawn } from "node:child_process";
        import { once } from "node:events";
        import { removeWhenGone, testTag } from ${JSON.stringify(cleanUp)};
        execFileSync("docker", ["run", "-d", "--name", ${JSON.stringify(`${prefix}-postgres-1`)}, "postgres:18-alpine", "sleep", "600"]);
        execFileSync("docker", ["tag", "postgres:18-alpine", ${JSON.stringify(`${prefix}/app`)}]);
        const tag = testTag();
        const parent = spawn(
          "sh",
          ["-c", "sleep 600 > /dev/null 2>&1 < /dev/null & echo $!"],
          { env: { ...process.env, ROBKIT_TEST_TAG: tag } },
        );
        const [app] = await once(parent.stdout, "data");
        await once(parent, "exit");
        removeWhenGone({ tagged: tag }, { docker: ${JSON.stringify(prefix)} });
        console.log(String(app).trim());
        setInterval(() => {}, 1000);
        `,
      ],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    const [line] = (await once(owner.stdout, "data")) as [Buffer];
    const app = Number(line.toString().trim());

    expect(await containerNames(prefix)).toEqual([`${prefix}-postgres-1`]);
    expect(await imageNames(prefix)).toEqual([`${prefix}/app`]);
    expect(alive(app)).toBe(true);

    owner.kill("SIGKILL");

    await eventually(async () => (await containerNames(prefix)).length === 0);
    await eventually(async () => (await imageNames(prefix)).length === 0);
    await eventually(() => !alive(app));
  });
});
