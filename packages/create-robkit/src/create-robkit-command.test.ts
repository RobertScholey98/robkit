import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile, spawnSync } from "node:child_process";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { reportFaultsAt } from "@robkit/dev/cli";
import { describe, expect, it } from "vitest";
import { drive, keys, questionsAsked, type Run } from "./test/drive.ts";
import { gitEnv } from "./test/git.ts";

const bin = fileURLToPath(new URL("create-robkit-command.ts", import.meta.url));

const run = promisify(execFile);
const defaultAnswers: [question: string, keys: string][] = [
  ["Which stack should the example app use?", keys.enter],
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

describe("init's entry file", () => {
  it("imports nothing, so it can check Node's version before anything loads", async () => {
    const source = await readFile(bin, "utf8");

    expect(source).not.toMatch(/^\s*(import|export)\b(?!\s*\()/m);
  });

  it("stops on a Node older than 24, saying which it needs and writing nothing", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "robkit-"));
    const older = join(cwd, "older-node.mjs");
    await writeFile(
      older,
      `Object.defineProperty(process.versions, "node", { value: "22.12.0" });\n`,
    );

    const { status, stdout, stderr } = spawnSync(
      process.execPath,
      [
        "--import",
        pathToFileURL(older).href,
        bin,
        "my-app",
        "--stack",
        "start",
      ],
      { cwd, encoding: "utf8" },
    );

    expect(status).toBe(1);
    expect(stdout + stderr).toBe(
      "Node 22.12.0 is too old: robkit needs Node 24 or later. Install it from https://nodejs.org, then run npm create robkit again.\n",
    );
    expect(await readdir(cwd)).toEqual(["older-node.mjs"]);
  });
});

/** What init prints last when it made an install in `my-app` under `cwd`. */
function nextSteps(cwd: string, ...steps: string[]): string {
  return `Made a robkit install in ${join(cwd, "my-app")}. Next:

${["cd my-app", ...steps, "pnpm dev"].map((step) => `  ${step}`).join("\n")}

Then open http://hub.robkit.localhost:3000 and claim the install.
`;
}

async function gitLog(dir: string): Promise<string> {
  const { stdout } = await run("git", ["log", "--format=%s"], { cwd: dir });
  return stdout.trim();
}

// Each runs a real pnpm install, which takes most of a minute under load.
describe("init with no --no-install", { timeout: 120_000 }, () => {
  it("writes, installs and commits, then prints the next commands and the hub's address", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "robkit-"));

    const { code, output } = await drive(
      bin,
      cwd,
      ["my-app", "--stack", "start", "--link"],
      [],
      await gitEnv(true),
      110_000,
    );

    expect(code).toBe(0);
    expect(output.endsWith(nextSteps(cwd))).toBe(true);
    const dir = join(cwd, "my-app");
    expect(await readdir(dir)).toContain("node_modules");
    expect(await gitLog(dir)).toBe("Make a robkit install");
    const { stdout } = await run("git", ["status", "--porcelain"], {
      cwd: dir,
    });
    expect(stdout).toBe("");
  });

  it("finishes with no git name or email, saying in one line that it made no commit", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "robkit-"));

    const { code, output } = await drive(
      bin,
      cwd,
      ["my-app", "--stack", "start", "--link"],
      [],
      await gitEnv(false),
      110_000,
    );

    expect(code).toBe(0);
    expect(
      output.endsWith(
        `git has no name or email set, so init made no first commit. Set them with git config --global user.name and git config --global user.email.\n${nextSteps(cwd)}`,
      ),
    ).toBe(true);
    const dir = join(cwd, "my-app");
    expect(await readdir(dir)).toContain("node_modules");
    await expect(gitLog(dir)).rejects.toThrow();
  });
});

describe("init with no flags", () => {
  it("asks init's questions and prints the command that skips them", async () => {
    const asked = await mkdtemp(join(tmpdir(), "robkit-"));

    const { code, output } = await init(
      asked,
      ["--no-install"],
      [
        ["Where should robkit create the install?", `my-app${keys.enter}`],
        ["Which stack should the example app use?", keys.down + keys.enter],
      ],
    );

    expect(code).toBe(0);
    expect(questionsAsked(output)).toEqual([
      "Where should robkit create the install?",
      "Which stack should the example app use?",
    ]);
    const command =
      "npm create robkit@latest my-app -- --stack react-hono --no-install";
    expect(output).toContain(command);

    // npm hands create-robkit the arguments after the --.
    const flagged = await mkdtemp(join(tmpdir(), "robkit-"));
    const args = command
      .split(" ")
      .slice(3)
      .filter((arg) => arg !== "--");
    expect((await init(flagged, args)).code).toBe(0);

    const fromAnswers = await readTree(join(asked, "my-app"));
    expect(fromAnswers.get("robkit.json")).toContain(
      `"exampleStack": "react-hono"`,
    );
    expect(await readTree(join(flagged, "my-app"))).toEqual(fromAnswers);
  });

  it("skips the folder question for a folder it's given, keeping --link", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "robkit-"));

    const { code, output } = await init(
      cwd,
      ["my-app", "--link", "--no-install"],
      defaultAnswers,
    );

    expect(code).toBe(0);
    expect(questionsAsked(output)).toEqual([
      "Which stack should the example app use?",
    ]);
    expect(output).toContain(
      "npm create robkit@latest my-app -- --stack start --no-install --link",
    );
  });

  it("with --no-install, writes only and prints the install command first", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "robkit-"));

    const { code, output } = await init(
      cwd,
      ["my-app", "--no-install"],
      defaultAnswers,
    );

    expect(code).toBe(0);
    expect(output.endsWith(nextSteps(cwd, "pnpm install"))).toBe(true);
    const written = await readdir(join(cwd, "my-app"));
    expect(written).not.toContain("node_modules");
    expect(written).not.toContain(".git");
  });

  it("prints a known problem alone, without a stack", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "robkit-"));

    const { code, output } = await init(cwd, ["my-app", "--stack", "nope"]);

    expect(code).toBe(1);
    expect(output).toMatch(
      /^--stack nope isn't an option\. Choose from: [^\n]+\.\n$/,
    );
  });

  it.each([
    [["--help"], "--help isn't an option."],
    [["my-app", "--stack"], "Option '--stack <value>' argument missing"],
  ])("refuses %j, printing why and the usage, not a bug", async (args, why) => {
    const cwd = await mkdtemp(join(tmpdir(), "robkit-"));

    const { code, output } = await init(cwd, args);

    expect(code).toBe(1);
    expect(
      output.startsWith(
        `${why}\n\nUsage: npm create robkit [folder] -- [options]\n`,
      ),
    ).toBe(true);
    expect(output).not.toContain(reportFaultsAt);
    expect(await readdir(cwd)).toEqual([]);
  });

  it("prints a fault it didn't expect whole, with where to report it", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "robkit-"));
    await writeFile(join(cwd, "notes.txt"), "mine");

    const { code, output } = await init(cwd, [
      "notes.txt/install",
      "--stack",
      "start",
      "--no-install",
    ]);

    expect(code).toBe(1);
    expect(output).toContain("ENOTDIR");
    expect(output).toMatch(/^ {4}at /m);
    expect(output).toContain(reportFaultsAt);
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
        ["Which stack should the example app use?", keys.ctrlC],
      ],
    );

    expect(code).toBe(1);
    expect(output).toContain("Cancelled. Nothing was written.");
    expect(await readdir(cwd)).toEqual([]);
  });
});

describe("init with --stack", () => {
  it("asks nothing", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "robkit-"));

    const { code, output } = await init(cwd, [
      "my-app",
      "--stack",
      "react-hono",
      "--no-install",
    ]);

    expect(code).toBe(0);
    expect(questionsAsked(output)).toEqual([]);
    expect(
      await readFile(join(cwd, "my-app", "robkit.json"), "utf8"),
    ).toContain(`"exampleStack": "react-hono"`);
  });

  it.each([
    [["--stack", "start"], "Usage: npm create robkit [folder]"],
    [
      ["my-app", "--stack", "rails"],
      "--stack rails isn't an option. Choose from: start, react-hono, express, next, go.",
    ],
  ])("refuses %j", async (args, message) => {
    const cwd = await mkdtemp(join(tmpdir(), "robkit-"));

    const { code, output } = await init(cwd, args);

    expect(code).toBe(1);
    expect(output).toContain(message);
    expect(await readdir(cwd)).toEqual([]);
  });
});
