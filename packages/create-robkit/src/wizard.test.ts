import { describe, expect, it } from "vitest";
import { choiceTable } from "./choices.ts";
import { commandFor, optionsFor, type Answers } from "./wizard.ts";

const answers: Answers = {
  folder: "family-apps",
  orm: "drizzle",
  "ui-kit": "none",
  generators: "start",
  install: true,
};

describe("commandFor", () => {
  it("asks for the install", () => {
    expect(commandFor(answers)).toBe(
      "npm create robkit@latest family-apps -- --orm drizzle --ui-kit none --generators start --install",
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

describe("optionsFor", () => {
  it("offers the table's ready options, then the ones coming later", () => {
    expect(optionsFor(choiceTable.generators, "start")).toEqual([
      { value: "start", label: "TanStack Start", hint: "recommended" },
      { value: "react-hono", label: "React + Hono" },
      {
        value: "next",
        label: "Next.js",
        hint: "coming later",
        disabled: true,
      },
      {
        value: "express",
        label: "React + Express",
        hint: "coming later",
        disabled: true,
      },
      {
        value: "go",
        label: "React + Go",
        hint: "coming later",
        disabled: true,
      },
    ]);
  });

  it("shows an option's own hint", () => {
    expect(optionsFor(choiceTable.uiKit)[0]).toEqual({
      value: "none",
      label: "No",
      hint: "the hub and admin use Tailwind",
    });
  });
});
