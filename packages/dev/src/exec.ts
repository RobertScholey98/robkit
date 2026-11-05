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
 * Runs a command to completion, rejecting if it exits non-zero. With a slug,
 * its output is prefixed with the slug; without one, it shares this process's
 * output.
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
  const exited: unknown[] = await once(child, "exit");
  const [code] = exited;
  if (code !== 0) {
    throw new Problem(
      `${[command, ...args].join(" ")} exited with ${String(code)}`,
    );
  }
}
