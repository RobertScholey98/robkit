// The stacks a sample can differ by: create-robkit's ready stacks, so a
// sixth stack shows up in every switcher, and a switcher without a sample
// for it fails the build.

import { readyStacks, stacks, type Stack } from "create-robkit";

export interface SwitcherStack {
  /** What `--stack` takes, such as `react-hono`. */
  value: Stack;
  /** Its name, such as "React + Hono". */
  label: string;
}

const isReady = (value: string): value is Stack =>
  (readyStacks as string[]).includes(value);

/** The stacks robkit can make, in the order it offers them. */
export const switcherStacks: SwitcherStack[] = stacks
  .filter((stack): stack is typeof stack & { value: Stack } =>
    isReady(stack.value),
  )
  .map(({ value, label }) => ({ value, label }));

/**
 * What's wrong with a switcher on `page` that `has` a sample for some
 * stacks, or undefined when it has one for each.
 */
export function missingStacks(
  all: readonly SwitcherStack[],
  has: (stack: string) => boolean,
  page: string,
): string | undefined {
  const missing = all.filter(({ value }) => !has(value));
  const [first] = missing;
  if (first === undefined) return undefined;
  return `${page} has a stack switcher with no sample for ${missing.map(({ label }) => label).join(" or ")}. Give it one for each, as <Fragment slot="${first.value}">.`;
}

/** Each stack's guide, by its docs page's id. */
const guides: Record<Stack, string> = {
  start: "build-an-app/tanstack-start",
  "react-hono": "build-an-app/react-hono",
  express: "build-an-app/react-express",
  next: "build-an-app/nextjs",
  go: "build-an-app/react-go",
};

/** The address of a stack's guide. */
export const guideHref = (stack: Stack): string => `/docs/${guides[stack]}/`;
