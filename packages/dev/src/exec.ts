import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { Problem } from "./cli.ts";

/** Copies each line from `from` to `to`, prefixed with the app's slug. */
export function prefixLines(
  slug: string,
  from: Readable | null,
  to: Writable,
): void {
  if (!from) return;
  createInterface({ input: from, crlfDelay: Infinity }).on("line", (line) => {
    to.write(`[${slug}] ${line}\n`);
  });
}

/**
 * The problem when a command can't start, such as a program that isn't
 * installed or a folder that's gone. Keeps the spawn error as its cause.
 */
export function startProblem(
  command: string,
  args: string[],
  cwd: string,
  error: unknown,
): Problem {
  const reason = error instanceof Error ? error.message : String(error);
  return new Problem(
    `${[command, ...args].join(" ")} couldn't start in ${cwd} (${reason}). Check that ${command} is installed and on your PATH.`,
    { cause: error },
  );
}

/**
 * Runs a command to completion. With a slug, its output is prefixed with
 * the slug; without one, it shares this process's output.
 *
 * @throws a {@link Problem} naming the command, its folder and its exit
 *   code if it fails, or saying why it couldn't start
 */
export async function exec(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; slug?: string },
): Promise<void> {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: options.slug ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (options.slug) {
    prefixLines(options.slug, child.stdout, process.stdout);
    prefixLines(options.slug, child.stderr, process.stderr);
  }
  let exited: unknown[];
  try {
    // Rejects with the child's error event, which it emits if it can't start.
    exited = await once(child, "exit");
  } catch (error) {
    throw startProblem(command, args, options.cwd, error);
  }
  const [code, signal] = exited;
  if (code !== 0) {
    throw new Problem(
      `${[command, ...args].join(" ")} exited with ${String(code ?? signal)} in ${options.cwd}. Its output is above: fix what it says, then try again.`,
    );
  }
}
