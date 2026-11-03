import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { S_STEP_SUBMIT } from "@clack/prompts";
import { describe, expect, it } from "vitest";

const bin = fileURLToPath(new URL("bin.ts", import.meta.url));

const keys = {
  enter: "\r",
  down: "\x1b[B",
  space: " ",
  no: "n",
  ctrlC: "\x03",
};

const defaultAnswers: [question: string, keys: string][] = [
  ["Which package manager?", keys.enter],
  ["Which ORM?", keys.enter],
  ["Add a shared React UI kit?", keys.enter],
  ["Which app generators should robkit add offer?", keys.enter],
  ["Which dev tools?", keys.enter],
  ["Install dependencies and initialise git?", keys.no + keys.enter],
];

interface Run {
  code: number | null;
  /** What init printed, without colours or cursor moves. */
  output: string;
}

/**
 * Runs init in `cwd` with `args`. For each question in `answers`, waits for
 * it to show, then types its keys. Kills init if a question doesn't show.
 */
function init(
  cwd: string,
  args: string[],
  answers: [question: string, keys: string][] = [],
): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd });
    const pending = [...answers];
    let output = "";
    let unseen = "";
    const stuck = setTimeout(() => {
      child.kill();
      const waiting = pending[0]?.[0];
      const problem = waiting
        ? `init never asked "${waiting}"`
        : "init didn't finish";
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

describe("init with no flags", { timeout: 30_000 }, () => {
  it("asks init's questions and prints the command that skips them", async () => {
    const asked = await mkdtemp(join(tmpdir(), "robkit-"));

    const { code, output } = await init(
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

    expect(code).toBe(0);
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
    expect((await init(flagged, args)).code).toBe(0);

    const fromAnswers = await readTree(join(asked, "my-app"));
    expect(fromAnswers.get("robkit.json")).toContain(`["react-hono"]`);
    expect(await readTree(join(flagged, "my-app"))).toEqual(fromAnswers);
  });

  it("skips the folder question for a folder it's given, keeping --link", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "robkit-"));

    const { code, output } = await init(
      cwd,
      ["my-app", "--link"],
      defaultAnswers,
    );

    expect(code).toBe(0);
    expect(questionsAsked(output)[0]).toBe("Which package manager?");
    expect(output).toContain(
      "npm create robkit@latest my-app -- --pm pnpm --orm drizzle --generators start,react-hono --tools eslint-prettier --link",
    );
  });

  it("refuses a folder name the printed command couldn't repeat", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "robkit-"));

    const { code, output } = await init(cwd, ["family&friends"]);

    expect(code).toBe(1);
    expect(output).toContain(
      "family&friends can't be the folder. Use letters, digits, spaces, dots, dashes, underscores and slashes.",
    );
    expect(await readdir(cwd)).toEqual([]);
  });

  it("checks the default folder before asking anything else", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "robkit-"));
    await mkdir(join(cwd, "my-robkit"));
    await writeFile(join(cwd, "my-robkit", "notes.txt"), "mine");

    const { code, output } = await init(
      cwd,
      [],
      [
        ["Where should robkit create the install?", keys.enter],
        ["my-robkit isn't empty. Choose a new folder.", keys.ctrlC],
      ],
    );

    expect(code).toBe(1);
    expect(output).toContain("Cancelled. Nothing was written.");
    expect(await readdir(join(cwd, "my-robkit"))).toEqual(["notes.txt"]);
  });

  it("writes nothing when cancelled", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "robkit-"));

    const { code, output } = await init(
      cwd,
      [],
      [
        ["Where should robkit create the install?", `my-app${keys.enter}`],
        ["Which package manager?", keys.ctrlC],
      ],
    );

    expect(code).toBe(1);
    expect(output).toContain("Cancelled. Nothing was written.");
    expect(await readdir(cwd)).toEqual([]);
  });
});
