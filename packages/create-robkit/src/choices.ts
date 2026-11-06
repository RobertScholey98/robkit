import { CommandProblem } from "@robkit/dev/cli";
import { type InputProblem, isRecord, problem } from "@robkit/input";

/** A stack an app can be made on. */
interface StackOption {
  /** How `--stack`, `robkit.json` and the code spell it. */
  readonly value: string;
  /** What the wizards show. */
  readonly label: string;
  /** Shown by init's wizard but not selectable, until a later release builds it. */
  readonly comingLater?: true;
}

/**
 * Every stack, in the order the wizards offer them. Each ready stack's
 * template is `templates/stacks/<value>`, so adding one is an entry here
 * plus that folder.
 */
export const stacks = [
  { value: "start", label: "TanStack Start" },
  { value: "react-hono", label: "React + Hono" },
  { value: "next", label: "Next.js", comingLater: true },
  { value: "express", label: "React + Express", comingLater: true },
  { value: "go", label: "React + Go", comingLater: true },
] as const satisfies readonly StackOption[];

type Ready = Exclude<(typeof stacks)[number], { comingLater: true }>;

/** A stack robkit can make an app on today. */
export type Stack = Ready["value"];

/** The stacks robkit can make today, with their labels. */
export const readyStackOptions: Ready[] = stacks.filter(
  (stack): stack is Ready => !("comingLater" in stack),
);

/** The stacks robkit can make today. Every install's robkit add offers them all. */
export const readyStacks: Stack[] = readyStackOptions.map(
  (stack) => stack.value,
);

/** Everything init asks, as `robkit.json` records it. */
export interface Choices {
  /** The stack of the example app init adds. */
  exampleStack: Stack;
}

export const defaultChoices: Choices = { exampleStack: "start" };

/** The stack `--stack` names, refusing one robkit can't make. */
export function stackFrom(value: string): Stack {
  const stack = readyStacks.find((ready) => ready === value);
  if (stack === undefined) {
    throw new CommandProblem(
      `--stack ${value} isn't an option. Choose from: ${readyStacks.join(", ")}.`,
    );
  }
  return stack;
}

/** The choices `robkit.json` records, read from `value`. */
export function readChoices(value: unknown): Choices | InputProblem {
  if (!isRecord(value)) {
    return problem(
      'robkit.json must be a JSON object, such as {"exampleStack": "start"}. Init wrote it; restore it from git if it has changed.',
    );
  }
  const options = readyStacks.join(" or ");
  const { exampleStack } = value;
  if (exampleStack === undefined) {
    return problem(
      `robkit.json: exampleStack is missing. Set it to the example app's stack: ${options}.`,
    );
  }
  const stack = readyStacks.find((ready) => ready === exampleStack);
  if (stack === undefined) {
    return problem(
      `robkit.json: exampleStack is ${JSON.stringify(exampleStack)}, which robkit can't make. Set it to ${options}.`,
    );
  }
  return { exampleStack: stack };
}
