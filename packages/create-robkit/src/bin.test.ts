import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { drive, keys, questionsAsked, type Run } from "./test/drive.ts";

const bin = fileURLToPath(new URL("bin.ts", import.meta.url));

const defaultAnswers: [question: string, keys: string][] = [
  ["Which package manager?", keys.enter],
  ["Which ORM?", keys.enter],
  ["Add a shared React UI kit?", keys.enter],
  ["Which app generators should robkit add offer?", keys.enter],
  ["Install dependencies and initialise git?", keys.no + keys.enter],
];

/** Runs init in `cwd` with `args`, answering its questions. */
function init(
  cwd: string,
  args: string[],
  answers: [question: string, keys: string][] = [],
): Promise<Run> {
  return drive(bin, cwd, args, answers);
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
        ["Which package manager?", keys.enter],
        ["Which ORM?", keys.enter],
        ["Add a shared React UI kit?", keys.enter],
        [
          "Which app generators should robkit add offer?",
          keys.space + keys.enter,
        ],
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
      "Install dependencies and initialise git?",
    ]);
    const command =
      "npm create robkit@latest my-app -- --pm pnpm --orm drizzle --ui-kit none --generators react-hono";
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
      "npm create robkit@latest my-app -- --pm pnpm --orm drizzle --ui-kit none --generators start,react-hono --link",
    );
  });

  it("asks which UI kit after a yes, and records it", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "robkit-"));

    const { code, output } = await init(
      cwd,
      ["my-app"],
      [
        ["Which package manager?", keys.enter],
        ["Which ORM?", keys.enter],
        ["Add a shared React UI kit?", keys.down + keys.enter],
        ["Which UI kit?", keys.enter],
        ["Which app generators should robkit add offer?", keys.enter],
        ["Install dependencies and initialise git?", keys.no + keys.enter],
      ],
    );

    expect(code).toBe(0);
    expect(output).toContain("--ui-kit shadcn-base-ui");
    const tree = await readTree(join(cwd, "my-app"));
    expect(tree.get("robkit.json")).toContain(`"uiKit": "shadcn-base-ui"`);
    expect(tree.has(join("packages", "ui", "package.json"))).toBe(true);
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
