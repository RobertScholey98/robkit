// The stacks a sample can differ by: create-robkit's ready stacks, so a
// sixth stack shows up in every switcher, and a switcher without a sample
// for it fails the build.

import { readyStacks, stacks } from "create-robkit";

export interface SwitcherStack {
  /** What `--stack` takes, such as `react-hono`. */
  value: string;
  /** Its name, such as "React + Hono". */
  label: string;
}

/** The stacks robkit can make, in the order it offers them. */
export const switcherStacks: SwitcherStack[] = stacks
  .filter(({ value }) => (readyStacks as string[]).includes(value))
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
