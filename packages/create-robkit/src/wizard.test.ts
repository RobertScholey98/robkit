import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandProblem } from "@robkit/dev/cli";
import { describe, expect, it } from "vitest";
import { answering, cancel, type Answer } from "./test/fake-prompts.ts";
import { askInit, commandFor, stackOptions, type Answers } from "./wizard.ts";

const answers: Answers = { folder: "family-apps", stack: "react-hono" };

const folderQuestion = "Where should robkit create the install?";
const stackQuestion = "Which stack should the example app use?";

/** A new folder with a file in it. */
async function folderInUse(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "robkit-wizard-"));
  await writeFile(join(dir, "notes.txt"), "");
  return dir;
}

describe("askInit", () => {
  it("asks for the folder, then the example's stack", async () => {
    const { prompts, asked } = answering(["family-apps", "react-hono"]);

    expect(await askInit(undefined, prompts)).toEqual({
      folder: "family-apps",
      stack: "react-hono",
    });
    expect(asked).toEqual([folderQuestion, stackQuestion]);
  });

  it("offers React + Express for the example", async () => {
    const { prompts } = answering(["family-apps", "express"]);

    expect(await askInit(undefined, prompts)).toEqual({
      folder: "family-apps",
      stack: "express",
    });
  });

  it("offers Next.js for the example", async () => {
    const { prompts } = answering(["family-apps", "next"]);

    expect(await askInit(undefined, prompts)).toEqual({
      folder: "family-apps",
      stack: "next",
    });
  });

  it("takes my-robkit for a folder when none is typed", async () => {
    const { prompts } = answering(["", "start"]);

    expect(await askInit(undefined, prompts)).toEqual({
      folder: "my-robkit",
      stack: "start",
    });
  });

  it("asks only for the stack when it's given the folder", async () => {
    const { prompts, asked } = answering(["start"]);

    expect(await askInit("family-apps", prompts)).toEqual({
      folder: "family-apps",
      stack: "start",
    });
    expect(asked).toEqual([stackQuestion]);
  });

  it("asks again for a folder that isn't empty, saying why", async () => {
    const used = await folderInUse();
    const { prompts, asked, refused } = answering([
      used,
      "family-apps",
      "start",
    ]);

    expect(await askInit(undefined, prompts)).toMatchObject({
      folder: "family-apps",
    });
    expect(asked).toEqual([folderQuestion, folderQuestion, stackQuestion]);
    expect(refused).toEqual([`${used} isn't empty. Choose a new folder.`]);
  });

  it("asks again for a folder no shell would read back the same", async () => {
    const { prompts, refused } = answering(["apps;rm", "apps", "start"]);

    expect(await askInit(undefined, prompts)).toMatchObject({ folder: "apps" });
    expect(refused).toEqual([
      "apps;rm can't be the folder. Use letters, digits, spaces, dots, dashes, underscores and slashes.",
    ]);
  });

  it("refuses a given folder that isn't empty before asking anything", async () => {
    const used = await folderInUse();
    const { prompts, asked } = answering([]);

    const asking = askInit(used, prompts);

    await expect(asking).rejects.toThrow(CommandProblem);
    await expect(asking).rejects.toThrow(
      `${used} isn't empty. Choose a new folder.`,
    );
    expect(asked).toEqual([]);
  });

  it.each<[string, Answer[]]>([
    ["the folder", [cancel]],
    ["the stack", ["family-apps", cancel]],
  ])("stops, writing nothing, when cancelled at %s", async (_, given) => {
    const { prompts } = answering(given);

    await expect(askInit(undefined, prompts)).rejects.toThrow(
      new CommandProblem("Cancelled. Nothing was written."),
    );
  });
});

describe("commandFor", () => {
  it("names the example's stack", () => {
    expect(commandFor(answers)).toBe(
      "npm create robkit@latest family-apps -- --stack react-hono",
    );
  });

  it("keeps --no-install and --link", () => {
    expect(commandFor(answers, { install: false, link: true })).toBe(
      "npm create robkit@latest family-apps -- --stack react-hono --no-install --link",
    );
  });

  it("quotes a folder a shell would split or rewrite", () => {
    expect(commandFor({ ...answers, folder: "family apps" })).toContain(
      `npm create robkit@latest "family apps" --`,
    );
    expect(
      commandFor({ ...answers, folder: String.raw`C:\apps\family` }),
    ).toContain(String.raw`npm create robkit@latest "C:\apps\family" --`);
  });
});

describe("stackOptions", () => {
  it("offers every stack, all of them ready", () => {
    expect(stackOptions()).toEqual([
      { value: "start", label: "TanStack Start", hint: "recommended" },
      { value: "react-hono", label: "React + Hono" },
      { value: "express", label: "React + Express" },
      { value: "next", label: "Next.js" },
      { value: "go", label: "React + Go" },
    ]);
  });
});
