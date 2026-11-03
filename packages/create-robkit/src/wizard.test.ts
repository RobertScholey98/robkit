import { describe, expect, it } from "vitest";
import { commandFor, type Answers } from "./wizard.ts";

const answers: Answers = {
  folder: "family-apps",
  pm: "pnpm",
  orm: "drizzle",
  generators: "start",
  tools: "none",
  install: true,
};

describe("commandFor", () => {
  it("asks for the install", () => {
    expect(commandFor(answers)).toBe(
      "npm create robkit@latest family-apps -- --pm pnpm --orm drizzle --generators start --tools none --install",
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
