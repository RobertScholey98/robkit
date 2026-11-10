import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { readRobkitRepo } from "../robkit-repo.ts";

/** `env` without PATH, whatever its case. */
function withoutPath(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => key.toUpperCase() !== "PATH"),
  );
}

/** The PATH in `env`, whatever its case, as Windows names it `Path`. */
function pathOf(env: NodeJS.ProcessEnv): string {
  const key = Object.keys(env).find((key) => key.toUpperCase() === "PATH");
  return (key === undefined ? undefined : env[key]) ?? "";
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

/** A new folder holding fake commands, each of which prints its line and exits 0. */
async function fakeCommands(
  commands: Record<string, FakeCommand>,
): Promise<string> {
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
  return dir;
}

/**
 * This process's environment with PATH set to a new folder holding fake
 * commands, each of which prints its line and exits 0.
 */
export async function pathWith(
  commands: Record<string, FakeCommand>,
): Promise<NodeJS.ProcessEnv> {
  return { ...withoutPath(process.env), PATH: await fakeCommands(commands) };
}

/**
 * `env` with fake commands ahead of everything else on its PATH, so each
 * stands in for the real one and every other command, such as git, is the
 * machine's own.
 */
export async function pathAhead(
  commands: Record<string, FakeCommand>,
  env: NodeJS.ProcessEnv,
): Promise<NodeJS.ProcessEnv> {
  return withPathAhead(await fakeCommands(commands), env);
}

/** `env` with `dir` ahead of everything else on its PATH. */
export function withPathAhead(
  dir: string,
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  return { ...withoutPath(env), PATH: [dir, pathOf(env)].join(delimiter) };
}

/**
 * The pnpm version an install made from this checkout names, such as
 * `11.28.9`. A fake pnpm prints it, so init takes it for one that can run
 * the install's.
 */
export async function installsPnpm(): Promise<string> {
  const { packageManager } = await readRobkitRepo();
  return packageManager.replace(/^pnpm@/, "").replace(/\+.*$/, "");
}
