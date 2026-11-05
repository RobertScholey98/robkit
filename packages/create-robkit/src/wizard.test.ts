import { describe, expect, it } from "vitest";
import { commandFor, stackOptions, type Answers } from "./wizard.ts";

const answers: Answers = { folder: "family-apps", stack: "react-hono" };

describe("commandFor", () => {
  it("names the example's stack", () => {
    expect(commandFor(answers)).toBe(
      "npm create robkit@latest family-apps -- --stack react-hono",
    );
  });

  it("keeps --install and --link", () => {
    expect(commandFor(answers, { install: true, link: true })).toBe(
      "npm create robkit@latest family-apps -- --stack react-hono --install --link",
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
  it("offers the ready stacks, then the ones coming later", () => {
    expect(stackOptions()).toEqual([
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
});
