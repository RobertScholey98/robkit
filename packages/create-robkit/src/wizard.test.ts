import { describe, expect, it } from "vitest";
import { choiceTable } from "./choices.ts";
import { commandFor, optionsFor, type Answers } from "./wizard.ts";

const answers: Answers = {
  folder: "family-apps",
  pm: "pnpm",
  orm: "drizzle",
  "ui-kit": "none",
  generators: "start",
  tools: "none",
  install: true,
};

describe("commandFor", () => {
  it("asks for the install", () => {
    expect(commandFor(answers)).toBe(
      "npm create robkit@latest family-apps -- --pm pnpm --orm drizzle --ui-kit none --generators start --tools none --install",
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
    expect(optionsFor(choiceTable.packageManager, "pnpm")).toEqual([
      { value: "pnpm", label: "pnpm", hint: "recommended" },
      { value: "bun", label: "bun", hint: "coming later", disabled: true },
      { value: "yarn", label: "yarn", hint: "coming later", disabled: true },
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
