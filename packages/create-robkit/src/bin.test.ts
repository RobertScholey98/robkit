import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { S_STEP_SUBMIT } from "@clack/prompts";
import { describe, expect, it } from "vitest";

const bin = fileURLToPath(new URL("bin.ts", import.meta.url));

const keys = { enter: "\r", down: "\x1b[B", space: " ", no: "n" };

/**
 * Runs init in `cwd` with `args`. For each question in `answers`, waits for
 * it to show, then types its keys. Resolves with what init printed.
 */
function init(
  cwd: string,
  args: string[],
  answers: [question: string, keys: string][] = [],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd });
    let output = "";
    let unseen = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      unseen += chunk.toString();
      const next = answers[0];
      if (next && stripVTControlCharacters(unseen).includes(next[0])) {
        answers.shift();
        unseen = "";
        child.stdin.write(next[1]);
        if (answers.length === 0) child.stdin.end();
      }
    });
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(stripVTControlCharacters(output));
      else reject(new Error(`init exited with ${String(code)}:\n${output}`));
    });
  });
}

/**
 * Each question init asked, in order, as it shows once answered. A prompt
 * redraws in place, so an answered question can start mid-line.
 */
function questionsAsked(output: string): string[] {
  const answered = new RegExp(`${S_STEP_SUBMIT}  (.+)`, "g");
  return [...new Set([...output.matchAll(answered)].map(([, q]) => q ?? ""))];
}

async function readTree(dir: string): Promise<Map<string, string>> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return new Map(
    await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const file = join(entry.parentPath, entry.name);
          return [relative(dir, file), await readFile(file, "utf8")] as const;
        }),
    ),
  );
}

describe("init with no flags", () => {
  it("asks init's questions and prints the command that skips them", async () => {
    const asked = await mkdtemp(join(tmpdir(), "robkit-"));

    const output = await init(
      asked,
      [],
      [
        ["Where should robkit create the install?", `my-app${keys.enter}`],
        // bun and yarn come later, so down stays on pnpm.
        ["Which package manager?", keys.down + keys.enter],
        ["Which ORM?", keys.enter],
        ["Add a shared React UI kit?", keys.enter],
        [
          "Which app generators should robkit add offer?",
          keys.space + keys.enter,
        ],
        ["Which dev tools?", keys.enter],
        ["Install dependencies and initialise git?", keys.no + keys.enter],
      ],
    );

    expect(questionsAsked(output)).toEqual([
      "Where should robkit create the install?",
      "Which package manager?",
      "Which ORM?",
      "Add a shared React UI kit?",
      "Which app generators should robkit add offer?",
      "Which dev tools?",
      "Install dependencies and initialise git?",
    ]);
    const command =
      "npm create robkit@latest my-app -- --pm pnpm --orm drizzle --generators react-hono --tools eslint-prettier";
    expect(output).toContain(command);

    // npm hands create-robkit the arguments after the --.
    const flagged = await mkdtemp(join(tmpdir(), "robkit-"));
    const args = command
      .split(" ")
      .slice(3)
      .filter((arg) => arg !== "--");
    await init(flagged, args);

    const fromAnswers = await readTree(join(asked, "my-app"));
    expect(fromAnswers.get("robkit.json")).toContain(`["react-hono"]`);
    expect(await readTree(join(flagged, "my-app"))).toEqual(fromAnswers);
  });
});
