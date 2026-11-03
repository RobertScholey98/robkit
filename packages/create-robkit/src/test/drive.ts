import { spawn } from "node:child_process";
import { stripVTControlCharacters } from "node:util";
import { S_STEP_SUBMIT } from "@clack/prompts";

export const keys = {
  enter: "\r",
  down: "\x1b[B",
  space: " ",
  no: "n",
  ctrlC: "\x03",
};

export interface Run {
  code: number | null;
  /** What it printed, without colours or cursor moves. */
  output: string;
}

/**
 * Runs the command line at `bin` in `cwd` with `args`. For each question in
 * `answers`, waits for it to show, then types its keys. Kills it if a
 * question doesn't show. `env` adds to its environment.
 */
export function drive(
  bin: string,
  cwd: string,
  args: string[],
  answers: [question: string, keys: string][] = [],
  env: NodeJS.ProcessEnv = {},
): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], {
      cwd,
      env: { ...process.env, ...env },
    });
    const pending = [...answers];
    let output = "";
    let unseen = "";
    const stuck = setTimeout(() => {
      child.kill();
      const waiting = pending[0]?.[0];
      const problem = waiting
        ? `it never asked "${waiting}"`
        : "it didn't finish";
      reject(
        new Error(`${problem}:
${output}`),
      );
    }, 20_000);
    if (pending.length === 0) child.stdin.end();
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      unseen += chunk.toString();
      const next = pending[0];
      if (next && stripVTControlCharacters(unseen).includes(next[0])) {
        pending.shift();
        unseen = "";
        child.stdin.write(next[1]);
        if (pending.length === 0) child.stdin.end();
      }
    });
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.on("error", reject);
    child.on("exit", (code) => {
      clearTimeout(stuck);
      resolve({ code, output: stripVTControlCharacters(output) });
    });
  });
}

/**
 * Each question asked, in order, as it shows once answered. A prompt
 * redraws in place, so an answered question can start mid-line.
 */
export function questionsAsked(output: string): string[] {
  const answered = new RegExp(`${S_STEP_SUBMIT}  (.+)`, "g");
  return [...new Set([...output.matchAll(answered)].map(([, q]) => q ?? ""))];
}
