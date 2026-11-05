import {
  CANCEL_SYMBOL,
  confirm,
  intro,
  isCancel,
  multiselect,
  select,
  text,
} from "@clack/prompts";
import {
  choiceTable,
  defaultChoices,
  listFlag,
  type Choice,
  type Option,
  type Flags,
} from "./choices.ts";
import { folderInUse } from "./write.ts";

/**
 * init's answers, as the flags that make the same install. The choice flags
 * come in the order init asks them, which is the order the command prints.
 */
export type Answers = { [Flag in keyof Flags]-?: string } & {
  folder: string;
  install: boolean;
};

/**
 * The options init offers for `choice`, from the table: the ones it can
 * make, then the ones a later release adds, shown but not yet selectable.
 */
export function optionsFor(choice: Choice, recommended?: string) {
  const ready = choice.options.filter((option) => !option.comingLater);
  const later = choice.options.filter((option) => option.comingLater);
  return [
    ...ready.map(({ value, label, hint }) => ({
      value,
      label,
      ...(value === recommended
        ? { hint: "recommended" }
        : hint !== undefined && { hint }),
    })),
    ...later.map(({ value, label }) => ({
      value,
      label,
      hint: "coming later",
      disabled: true,
    })),
  ];
}

/** "a, b or c". */
function orList(items: string[]): string {
  const last = items.at(-1) ?? "";
  return items.length > 1
    ? `${items.slice(0, -1).join(", ")} or ${last}`
    : last;
}

/**
 * Asks whether to add a UI kit, then which, and answers as `--ui-kit` takes
 * it. Yes is disabled until a kit is ready.
 */
async function askUiKit(): Promise<string> {
  // Widened from the table's literal types, which know no kit is ready yet.
  const uiKit: Choice = choiceTable.uiKit;
  const [none, ...kits] = uiKit.options as [Option, ...Option[]];
  const ready = kits.filter((kit) => !kit.comingLater);
  const answer = answered(
    await select({
      message: uiKit.question,
      options: [
        ...optionsFor({ ...uiKit, options: [none] }),
        {
          value: "yes",
          label: "Yes",
          ...(ready.length === 0 && {
            hint: `${orList(kits.map((kit) => kit.label))}, coming later`,
            disabled: true,
          }),
        },
      ],
    }),
  );
  if (answer === none.value) return none.value;
  return answered(
    await select({
      message: "Which UI kit?",
      options: optionsFor({ ...uiKit, options: kits }),
    }),
  );
}

function answered<T>(answer: T | typeof CANCEL_SYMBOL): T {
  if (isCancel(answer)) throw new Error("Cancelled. Nothing was written.");
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
        placeholder: defaultFolder,
        defaultValue: defaultFolder,
        // An empty answer takes the default, which clack doesn't validate.
        validate: (answer) => folderProblem(answer ?? defaultFolder),
      }),
    );
  const { generators } = choiceTable;
  const uiKit = await askUiKit();
  const stacks = answered(
    await multiselect({
      message: generators.question,
      options: optionsFor(generators),
      initialValues: [...defaultChoices.generators],
    }),
  );
  const install = answered(
    await confirm({ message: "Install dependencies and initialise git?" }),
  );
  return {
    folder: where,
    "ui-kit": uiKit,
    generators: listFlag(stacks),
    install,
  };
}

/** The command that makes the same install without asking. */
export function commandFor(
  { folder, install, ...flags }: Answers,
  link = false,
): string {
  return [
    `npm create robkit@latest ${shellWord(folder) ?? folder} --`,
    ...Object.entries(flags).map(([flag, value]) => `--${flag} ${value}`),
    ...(install ? ["--install"] : []),
    ...(link ? ["--link"] : []),
  ].join(" ");
}
