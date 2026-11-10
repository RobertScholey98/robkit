import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** This process's environment without PATH, whatever its case. */
function withoutPath(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "PATH"),
  );
}

/**
 * A fake command: the line it prints, and with `failsOn`, the first
 * argument that makes it print "it failed" and exit 1 instead.
 */
type FakeCommand = string | { line: string; failsOn: string };

function script(command: FakeCommand): string {
  const { line, failsOn } =
    typeof command === "string" ? { line: command, failsOn: "" } : command;
  if (process.platform === "win32") {
    const fails = failsOn
      ? `@if "%~1"=="${failsOn}" (echo it failed 1>&2 & exit /b 1)\r\n`
      : "";
    return `${fails}@echo ${line}\r\n`;
  }
  const fails = failsOn
    ? `if [ "$1" = "${failsOn}" ]; then echo it failed >&2; exit 1; fi\n`
    : "";
  return `#!/bin/sh\n${fails}echo ${line}\n`;
}

/**
 * This process's environment with PATH set to a new folder holding fake
 * commands, each of which prints its line and exits 0.
 */
export async function pathWith(
  commands: Record<string, FakeCommand>,
): Promise<NodeJS.ProcessEnv> {
  const dir = await mkdtemp(join(tmpdir(), "robkit-path-"));
  for (const [name, command] of Object.entries(commands)) {
    if (process.platform === "win32") {
      await writeFile(join(dir, `${name}.cmd`), script(command));
    } else {
      const file = join(dir, name);
      await writeFile(file, script(command));
      await chmod(file, 0o755);
    }
  }
  return { ...withoutPath(), PATH: dir };
}
