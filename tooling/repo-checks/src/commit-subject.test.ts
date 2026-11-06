import { glob, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { maxSubjectLength, subjectProblems } from "./commit-subject.ts";
import { repoRoot } from "./doc-examples.ts";

describe("subjectProblems", () => {
  it.each([
    "Fail lint on a suppression without a reason",
    "Add CODEOWNERS",
    "Embed the theme in the hub",
    "Bring the guard's errors in line",
    "A".padEnd(72, "a"),
  ])("accepts %j", (subject) => {
    expect(subjectProblems(subject)).toEqual([]);
  });

  it("checks only the first line of a message", () => {
    expect(
      subjectProblems("Add the gate job\n\nIt checks every job's result.\n"),
    ).toEqual([]);
  });

  it("skips the comment lines git puts in the message file", () => {
    expect(
      subjectProblems(
        "# Please enter the commit message.\n\nAdd the gate job\n# On branch x\n",
      ),
    ).toEqual([]);
  });

  it("refuses a subject over 72 characters", () => {
    expect(subjectProblems("A".padEnd(73, "a"))).toEqual([
      "The subject is 73 characters; keep it to 72.",
    ]);
  });

  it("refuses a trailing period", () => {
    expect(subjectProblems("Add the gate job.")).toEqual([
      "The subject ends with a period.",
    ]);
  });

  it("refuses a subject that doesn't start with a capital letter", () => {
    expect(subjectProblems("add the gate job")).toEqual([
      "The subject starts with a capital letter.",
    ]);
  });

  it.each(["Added the gate job", "Adding the gate job"])(
    "refuses a first word that isn't imperative: %j",
    (subject) => {
      expect(subjectProblems(subject)).toEqual([
        `The subject starts with an imperative verb ("Add", not "Added" or "Adding").`,
      ]);
    },
  );

  it("refuses an empty message", () => {
    expect(subjectProblems("# only a comment\n\n")).toEqual([
      "The message has no subject.",
    ]);
  });

  it("lists every problem at once", () => {
    expect(subjectProblems("fixed it.")).toEqual([
      "The subject ends with a period.",
      "The subject starts with a capital letter.",
      `The subject starts with an imperative verb ("Add", not "Added" or "Adding").`,
    ]);
  });
});

describe("maxSubjectLength", () => {
  it("is the number every doc quotes for a subject", async () => {
    const quotes: string[] = [];
    for await (const file of glob(["*.md", "docs/**/*.md"], {
      cwd: repoRoot,
    })) {
      const text = await readFile(join(repoRoot, file), "utf8");
      for (const line of text.split("\n")) {
        if (!/subject/i.test(line)) continue;
        for (const [, length] of line.matchAll(/(\d+) characters/g)) {
          quotes.push(`${file.replaceAll("\\", "/")}: ${String(length)}`);
        }
      }
    }

    expect(quotes.sort()).toEqual([
      `CLAUDE.md: ${String(maxSubjectLength)}`,
      `CONTRIBUTING.md: ${String(maxSubjectLength)}`,
      `CONTRIBUTING.md: ${String(maxSubjectLength)}`,
    ]);
  });
});
