import { readyStacks } from "create-robkit";
import { describe, expect, it } from "vitest";
import { missingStacks, switcherStacks, type SwitcherStack } from "./stacks.ts";

describe("switcherStacks", () => {
  it("are create-robkit's ready stacks, in its order, with their names", () => {
    expect(switcherStacks.map(({ value }) => value)).toEqual(readyStacks);
    expect(switcherStacks.map(({ label }) => label)).toEqual([
      "TanStack Start",
      "React + Hono",
      "React + Express",
      "Next.js",
      "React + Go",
    ]);
  });
});

describe("missingStacks", () => {
  const stacks: SwitcherStack[] = [
    { value: "start", label: "TanStack Start" },
    { value: "go", label: "React + Go" },
  ];

  it("is nothing when the switcher has a sample for every stack", () => {
    expect(missingStacks(stacks, () => true, "/docs/a/")).toBeUndefined();
  });

  it("names the page and each stack without a sample", () => {
    expect(missingStacks(stacks, () => false, "/docs/a/")).toBe(
      '/docs/a/ has a stack switcher with no sample for TanStack Start or React + Go. Give it one for each, as <Fragment slot="start">.',
    );
    expect(
      missingStacks(stacks, (stack) => stack === "start", "/docs/a/"),
    ).toBe(
      '/docs/a/ has a stack switcher with no sample for React + Go. Give it one for each, as <Fragment slot="go">.',
    );
  });
});
