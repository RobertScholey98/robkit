import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  CANCEL_SYMBOL,
  confirm,
  intro,
  isCancel,
  multiselect,
  select,
  text,
} from "@clack/prompts";
import * as choices from "./choices.ts";

/** init's answers, as the flags that make the same install. */
export interface Answers {
  folder: string;
  pm: string;
  orm: string;
  generators: string;
  tools: string;
  install: boolean;
}

/** What init calls each option whose value isn't its name. */
const labels: Record<string, string> = {
  drizzle: "Drizzle",
  prisma: "Prisma",
  kysely: "Kysely",
  start: "TanStack Start",
  "react-hono": "React + Hono",
  next: "Next.js",
  express: "React + Express",
  go: "React + Go",
  "eslint-prettier": "ESLint + Prettier",
  vitest: "Vitest",
  playwright: "Playwright",
  husky: "Husky + lint-staged",
};

/**
 * The options init offers: the ones it can make, then the ones a later
 * release adds, shown but not yet selectable.
 */
function optionsFor(
  ready: readonly string[],
  comingLater: string[],
  recommended?: string,
) {
  const label = (value: string) => labels[value] ?? value;
  return [
    ...ready.map((value) => ({
      value,
      label: label(value),
      ...(value === recommended && { hint: "recommended" }),
    })),
    ...comingLater
      .filter((value) => !ready.includes(value))
      .map((value) => ({
        value,
        label: label(value),
        hint: "coming later",
        disabled: true,
      })),
  ];
}

function answered<T>(answer: T | typeof CANCEL_SYMBOL): T {
  if (isCancel(answer)) throw new Error("Cancelled. Nothing was written.");
  return answer;
}

/**
 * Characters a folder can hold and still be pasted into any shell from the
 * printed command, quoted only when it has a space.
 */
const shellSafe = /^[\p{L}\p{N} ._/\\:-]+$/u;

function folderProblem(folder: string | undefined): string | undefined {
  if (!folder) return undefined;
  if (!shellSafe.test(folder)) {
    return `${folder} can't be the folder. Use letters, digits, spaces, dots, dashes, underscores and slashes.`;
  }
  try {
    if (readdirSync(resolve(folder)).length > 0) {
      return `${folder} isn't empty. Choose a new folder.`;
    }
  } catch {
    // A folder that doesn't exist yet is the usual answer.
  }
  return undefined;
}

/** Asks init's questions, skipping the folder when it's already given. */
export async function askInit(folder?: string): Promise<Answers> {
  const problem = folderProblem(folder);
  if (problem) throw new Error(problem);
  intro("robkit");
  const where =
    folder ??
    answered(
      await text({
        message: "Where should robkit create the install?",
        placeholder: "my-robkit",
        defaultValue: "my-robkit",
        validate: folderProblem,
      }),
    );
  const pm = answered(
    await select({
      message: "Which package manager?",
      options: optionsFor(
        choices.packageManagers,
        ["bun", "yarn"],
        choices.defaultChoices.packageManager,
      ),
    }),
  );
  const orm = answered(
    await select({
      message: "Which ORM?",
      options: optionsFor(
        choices.orms,
        ["prisma", "kysely"],
        choices.defaultChoices.orm,
      ),
    }),
  );
  answered(
    await select({
      message: "Add a shared React UI kit?",
      options: [
        { value: "no", label: "No", hint: "the hub and admin use Tailwind" },
        {
          value: "yes",
          label: "Yes",
          hint: "shadcn or Chakra UI, coming later",
          disabled: true,
        },
      ],
    }),
  );
  const generators = answered(
    await multiselect({
      message: "Which app generators should robkit add offer?",
      options: optionsFor(choices.generators, ["next", "express", "go"]),
      initialValues: [...choices.defaultChoices.generators],
    }),
  );
  const tools = answered(
    await multiselect({
      message: "Which dev tools?",
      options: optionsFor(choices.tools, ["vitest", "playwright", "husky"]),
      initialValues: [...choices.defaultChoices.tools],
      required: false,
    }),
  );
  const install = answered(
    await confirm({ message: "Install dependencies and initialise git?" }),
  );
  return {
    folder: where,
    pm,
    orm,
    generators: generators.join(","),
    tools: tools.length > 0 ? tools.join(",") : "none",
    install,
  };
}

/** The command that makes the same install without asking. */
export function commandFor(answers: Answers, link = false): string {
  const { folder, pm, orm, generators, tools, install } = answers;
  return [
    `npm create robkit@latest ${/\s/.test(folder) ? `"${folder}"` : folder} --`,
    `--pm ${pm} --orm ${orm} --generators ${generators} --tools ${tools}`,
    ...(install ? ["--install"] : []),
    ...(link ? ["--link"] : []),
  ].join(" ");
}
