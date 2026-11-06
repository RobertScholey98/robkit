import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Problem } from "./run-command.ts";
import { exec } from "./exec.ts";

describe("exec", () => {
  it("runs a command to completion", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "robkit-"));

    await expect(
      exec(process.execPath, ["-e", ""], { cwd, env: process.env }),
    ).resolves.toBeUndefined();
  });

  it("names the command, its folder and its exit code when it fails, and says its output is above", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "robkit-"));

    const running = exec("node", ["-e", "process.exit(3)"], {
      cwd,
      env: process.env,
      slug: "alpha",
    });

    await expect(running).rejects.toThrow(Problem);
    await expect(running).rejects.toThrow(
      `node -e process.exit(3) exited with 3 in ${cwd}. Its output is above: fix what it says, then try again.`,
    );
  });

  it("says what to check when a command can't start, keeping why", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "robkit-"));

    const running = exec("robkit-no-such-command", ["up"], {
      cwd,
      env: process.env,
    });

    await expect(running).rejects.toThrow(Problem);
    await expect(running).rejects.toThrow(
      `robkit-no-such-command up couldn't start in ${cwd} (spawn robkit-no-such-command ENOENT). Check that robkit-no-such-command is installed and on your PATH, and that the folder exists.`,
    );
    await expect(running).rejects.toHaveProperty("cause.code", "ENOENT");
  });
});
