import { spawn, type SpawnOptions } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { CommandProblem } from "@robkit/input/command";
import { stopGroup } from "./process-group.ts";

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
): CommandProblem {
  const reason = error instanceof Error ? error.message : String(error);
  return new CommandProblem(
    `${[command, ...args].join(" ")} couldn't start in ${cwd} (${reason}). Check that ${command} is installed and on your PATH, and that the folder exists.`,
    { cause: error },
  );
}

const outputIsAbove = " Its output is above: fix what it says, then try again.";

/**
 * The problem when a command ran and failed. Its message says the
 * command's output is above, which is so in the terminal that ran it.
 */
export class CommandFailed extends CommandProblem {
  constructor(what: string) {
    super(`${what}${outputIsAbove}`);
  }

  /**
   * What failed, without where its output is, for a caller that reports
   * the failure in another terminal.
   */
  get what(): string {
    return this.message.slice(0, -outputIsAbove.length);
  }
}

/**
 * The command line Windows' shell runs for `command` and `args`, each part
 * in double quotes so the shell reads none of it. A quote can't keep `"`,
 * `%`, a line break or a trailing backslash from the shell, so a part with
 * one is a fault in its caller. A plain command name, such as `pnpm`, stays
 * bare: a batch file the shell finds on PATH by a quoted name can't find its
 * own folder, which pnpm's .cmd needs.
 */
export function windowsCommandLine(command: string, args: string[]): string {
  const parts = [command, ...args];
  const unsafe = parts.find((part) => /["%\r\n]|\\$/.test(part));
  if (unsafe !== undefined) {
    throw new Error(
      `exec can't pass ${JSON.stringify(unsafe)} through the Windows shell. Pass no ", %, line break or trailing backslash.`,
    );
  }
  const quote = (part: string) => `"${part}"`;
  const name = /^[\w.-]+$/.test(command) ? command : quote(command);
  return [name, ...args.map(quote)].join(" ");
}

/**
 * Runs a command to completion. With a slug, its output is prefixed with
 * the slug; quiet, it goes nowhere; otherwise it shares this process's
 * output. On Windows the
 * shell starts it, so a command that isn't installed exits 1 with the
 * shell's message rather than failing to start.
 *
 * @throws a {@link CommandProblem} naming the command, its folder and its exit
 *   code if it fails, or saying why it couldn't start. A command its signal
 *   stopped is no failure.
 */
export async function exec(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    slug?: string;
    quiet?: boolean;
    /**
     * Stops the command when it aborts. The command then runs in its own
     * process group, and every process in it is stopped. `exec` returns once
     * they are gone, with no error, so the caller reads the signal.
     */
    signal?: AbortSignal | undefined;
  },
): Promise<void> {
  const { signal } = options;
  if (signal?.aborted) return;
  const spawnOptions = {
    cwd: options.cwd,
    env: options.env,
    stdio: options.quiet
      ? "ignore"
      : options.slug
        ? ["ignore", "pipe", "pipe"]
        : "inherit",
    // Its own process group, so stopping it reaches every process it starts.
    // Windows has no process groups, and would open a console for one.
    detached: signal !== undefined && process.platform !== "win32",
  } satisfies SpawnOptions;
  // Windows starts pnpm and npm from .cmd files, which only its shell runs.
  const child =
    process.platform === "win32"
      ? spawn(windowsCommandLine(command, args), {
          ...spawnOptions,
          shell: true,
        })
      : spawn(command, args, spawnOptions);
  if (options.slug) {
    prefixLines(options.slug, child.stdout, process.stdout);
    prefixLines(options.slug, child.stderr, process.stderr);
  }
  let stopped: Promise<void> | undefined;
  const stopIt = () => {
    if (spawnOptions.detached) {
      stopped = stopGroup(options.slug ?? command, child.pid);
      // Awaited below, once the command has exited.
      stopped.catch(() => undefined);
    } else {
      child.kill();
      stopped = Promise.resolve();
    }
  };
  signal?.addEventListener("abort", stopIt, { once: true });
  let exited: unknown[];
  try {
    // Rejects with the child's error event, which it emits if it can't start.
    exited = await once(child, "exit");
  } catch (error) {
    throw startProblem(command, args, options.cwd, error);
  } finally {
    signal?.removeEventListener("abort", stopIt);
  }
  if (stopped) {
    await stopped;
    return;
  }
  const [code, exitSignal] = exited;
  if (code !== 0) {
    throw new CommandFailed(
      `${[command, ...args].join(" ")} exited with ${String(code ?? exitSignal)} in ${options.cwd}.`,
    );
  }
}
