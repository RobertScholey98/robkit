import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { CommandProblem } from "@robkit/input/command";
import { exec, windowsCommandLine } from "./exec.ts";

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

    await expect(running).rejects.toThrow(CommandProblem);
    await expect(running).rejects.toThrow(
      `node -e process.exit(3) exited with 3 in ${cwd}. Its output is above: fix what it says, then try again.`,
    );
  });

  it("prints nothing of the command's output when quiet", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "robkit-"));
    const execTs = pathToFileURL(
      fileURLToPath(new URL("exec.ts", import.meta.url)),
    );
    // exec runs in a process of its own, whose output the test reads.
    const script = `
      import { exec } from ${JSON.stringify(execTs.href)};
      const say = ["-e", "console.log('out'); console.error('err')"];
      await exec(process.execPath, say, { cwd: process.cwd(), env: process.env, quiet: true });
      console.log("done");
    `;

    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      ["--input-type=module", "-e", script],
      { cwd },
    );

    expect({ stdout, stderr }).toEqual({ stdout: "done\n", stderr: "" });
  });

  // A process group is how it reaches what the command started.
  it.skipIf(process.platform === "win32")(
    "stops the command, and what it started, when its signal aborts, then returns",
    async () => {
      const cwd = await mkdtemp(join(tmpdir(), "robkit-"));
      const stop = new AbortController();
      // The shell starts a process and waits for it, as pnpm does a script.
      const running = exec(
        "sh",
        ["-c", "sleep 599 & echo $! > started; wait"],
        {
          cwd,
          env: process.env,
          quiet: true,
          signal: stop.signal,
        },
      );
      let started = "";
      while (started === "") {
        await delay(20);
        if (existsSync(join(cwd, "started"))) {
          started = await readFile(join(cwd, "started"), "utf8");
        }
      }

      stop.abort();

      await expect(running).resolves.toBeUndefined();
      expect(() => process.kill(Number(started), 0)).toThrow("ESRCH");
    },
  );

  it("runs nothing once its signal has aborted", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "robkit-"));

    await exec(
      process.execPath,
      ["-e", "require('node:fs').writeFileSync('ran', '')"],
      { cwd, env: process.env, signal: AbortSignal.abort() },
    );

    expect(existsSync(join(cwd, "ran"))).toBe(false);
  });

  // On Windows the shell starts the command, so a missing one prints the
  // shell's own message and exits 1 rather than failing to start.
  it.skipIf(process.platform === "win32")(
    "says what to check when a command can't start, keeping why",
    async () => {
      const cwd = await mkdtemp(join(tmpdir(), "robkit-"));

      const running = exec("robkit-no-such-command", ["up"], {
        cwd,
        env: process.env,
      });

      await expect(running).rejects.toThrow(CommandProblem);
      await expect(running).rejects.toThrow(
        `robkit-no-such-command up couldn't start in ${cwd} (spawn robkit-no-such-command ENOENT). Check that robkit-no-such-command is installed and on your PATH, and that the folder exists.`,
      );
      await expect(running).rejects.toHaveProperty("cause.code", "ENOENT");
    },
  );
});

describe("windowsCommandLine", () => {
  // A batch file the shell finds on PATH by a quoted name can't find its own
  // folder, which pnpm's .cmd needs.
  it("leaves a command named without spaces unquoted", () => {
    expect(windowsCommandLine("pnpm", ["install", "a & b"])).toBe(
      'pnpm "install" "a & b"',
    );
  });

  it("quotes each part, so the shell reads none of them", () => {
    expect(
      windowsCommandLine(String.raw`C:\Program Files\nodejs\node.exe`, [
        "-e",
        "",
        "a & b | c > d",
      ]),
    ).toBe(
      String.raw`"C:\Program Files\nodejs\node.exe" "-e" "" "a & b | c > d"`,
    );
  });

  it.each(['say "hi"', "%PATH%", "two\nlines", String.raw`C:\dir\ `.trim()])(
    "refuses %j, which a quote can't keep from the shell",
    (part) => {
      expect(() => windowsCommandLine("pnpm", [part])).toThrow(
        `exec can't pass ${JSON.stringify(part)} through the Windows shell. Pass no ", %, line break or trailing backslash.`,
      );
    },
  );
});
