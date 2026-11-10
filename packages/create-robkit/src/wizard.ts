import { CANCEL_SYMBOL, isCancel } from "@clack/prompts";
import { CommandProblem } from "@robkit/dev/cli";
import { defaultChoices, stackFrom, stacks, type Stack } from "./choices.ts";
import { terminalPrompts, type Prompts } from "./prompts.ts";
import { folderInUse } from "./write.ts";

/** init's answers: the install's folder and the example app's stack. */
export interface Answers {
  folder: string;
  stack: Stack;
}

/**
 * The stacks init offers for the example app: the ones it can make, the
 * default recommended, then the ones a later release adds, shown but not
 * yet selectable.
 */
export function stackOptions() {
  return stacks.map(({ value, label, ...stack }) =>
    "comingLater" in stack
      ? { value, label, hint: "coming later", disabled: true }
      : {
          value,
          label,
          ...(value === defaultChoices.exampleStack && {
            hint: "recommended",
          }),
        },
  );
}

function answered<T>(answer: T | typeof CANCEL_SYMBOL): T {
  if (isCancel(answer))
    throw new CommandProblem("Cancelled. Nothing was written.");
  return answer;
}

/**
 * The folder as the printed command spells it, so it reads back the same in
 * bash, PowerShell and cmd, or undefined for a name no quoting would keep.
 * Shells share no escape, so only double quotes, around these characters.
 */
function shellWord(folder: string): string | undefined {
  if (!/^[\p{L}\p{N} ._/\\:-]+$/u.test(folder)) return undefined;
  return /^[\p{L}\p{N}._/-]+$/u.test(folder) ? folder : `"${folder}"`;
}

function folderProblem(folder: string | undefined): string | undefined {
  if (!folder) return undefined;
  if (shellWord(folder) === undefined) {
    return `${folder} can't be the folder. Use letters, digits, spaces, dots, dashes, underscores and slashes.`;
  }
  return folderInUse(folder);
}

const defaultFolder = "my-robkit";

/**
 * Asks init's questions with `prompts`, skipping the folder when it's
 * already given.
 */
export async function askInit(
  folder?: string,
  { intro, text, select }: Prompts = terminalPrompts,
): Promise<Answers> {
  const problem = folderProblem(folder);
  if (problem) throw new CommandProblem(problem);
  intro("robkit");
  const where =
    folder ??
    answered(
      await text({
        message: "Where should robkit create the install?",
        placeholder: defaultFolder,
        defaultValue: defaultFolder,
        // An empty answer takes the default, which clack doesn't validate.
        validate: (answer) => folderProblem(answer ?? defaultFolder),
      }),
    );
  const stack = stackFrom(
    answered(
      await select({
        message: "Which stack should the example app use?",
        options: stackOptions(),
        initialValue: defaultChoices.exampleStack,
      }),
    ),
  );
  return { folder: where, stack };
}

/** The command that makes the same install without asking. */
export function commandFor(
  { folder, stack }: Answers,
  { install = true, link = false } = {},
): string {
  return [
    `npm create robkit@latest ${shellWord(folder) ?? folder} --`,
    `--stack ${stack}`,
    ...(install ? [] : ["--no-install"]),
    ...(link ? ["--link"] : []),
  ].join(" ");
}
