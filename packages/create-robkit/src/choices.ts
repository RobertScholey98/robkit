/** One answer to one of init's questions. */
export interface Option {
  /** How the flag, `robkit.json` and the code spell the option. */
  readonly value: string;
  /** What the wizard shows. */
  readonly label: string;
  /** What the wizard shows beside the label. */
  readonly hint?: string;
  /**
   * The template folder, under `templates/`, the option lays over the
   * install. An option with none adds no files of its own.
   */
  readonly layer?: string;
  /**
   * The template folder, under `templates/`, the option lays over every
   * app's files: the example's and each app robkit add writes.
   */
  readonly appLayer?: string;
  /**
   * A section, as a file under `templates/`, the option adds to the end of
   * every app's `AGENTS.md`.
   */
  readonly appGuide?: string;
  /**
   * For a UI kit: the template folder holding one folder per stack, laid
   * over an app on that stack that uses the kit.
   */
  readonly optInLayer?: string;
  /** Shown by the wizard but not selectable, until a later release builds it. */
  readonly comingLater?: true;
}

/** One of init's questions. */
export interface Choice {
  /** The flag that answers it, without the `--`. */
  readonly flag: string;
  /** How the wizard asks it. */
  readonly question: string;
  /** What the usage text calls it. */
  readonly about: string;
  /**
   * `one` takes a single option. `list` takes several, comma-separated, in
   * the order given.
   */
  readonly takes: "one" | "list";
  readonly options: readonly Option[];
}

/**
 * Every choice init makes, in the order it asks them and lays down their
 * template layers. Adding an option is one entry here plus its layer.
 */
export const choiceTable = {
  orm: {
    flag: "orm",
    question: "Which ORM?",
    about: "ORM",
    takes: "one",
    options: [
      {
        value: "drizzle",
        label: "Drizzle",
        appLayer: "orms/drizzle/app",
        appGuide: "orms/drizzle/AGENTS.md",
      },
      {
        value: "kysely",
        label: "Kysely",
        appLayer: "orms/kysely/app",
        appGuide: "orms/kysely/AGENTS.md",
      },
    ],
  },
  uiKit: {
    flag: "ui-kit",
    question: "Add a shared React UI kit?",
    about: "shared React UI kit",
    takes: "one",
    options: [
      // The no-kit hub and admin. A kit's layer goes over this one,
      // replacing their controls and adding packages/ui.
      {
        value: "none",
        label: "No",
        hint: "the hub and admin use Tailwind",
        layer: "ui-kits/none",
      },
      {
        value: "shadcn-base-ui",
        label: "shadcn on Base UI",
        layer: "ui-kits/shadcn-base-ui/install",
        optInLayer: "ui-kits/shadcn/app",
      },
      {
        value: "shadcn-radix",
        label: "shadcn on Radix",
        layer: "ui-kits/shadcn-radix/install",
        optInLayer: "ui-kits/shadcn/app",
      },
      {
        value: "chakra",
        label: "Chakra UI",
        layer: "ui-kits/chakra/install",
        optInLayer: "ui-kits/chakra/app",
      },
    ],
  },
  generators: {
    flag: "generators",
    question: "Which app generators should robkit add offer?",
    about: "stacks robkit add offers, the first making the example app",
    takes: "list",
    options: [
      { value: "start", label: "TanStack Start", layer: "stacks/start" },
      {
        value: "react-hono",
        label: "React + Hono",
        layer: "stacks/react-hono",
      },
      { value: "next", label: "Next.js", comingLater: true },
      { value: "express", label: "React + Express", comingLater: true },
      { value: "go", label: "React + Go", comingLater: true },
    ],
  },
} as const satisfies Record<string, Choice>;

type Table = typeof choiceTable;
export type ChoiceName = keyof Table;

/** The values of a choice's options that init can make today. */
type Ready<C extends Choice> = Exclude<
  C["options"][number],
  { comingLater: true }
>["value"];

export type Orm = Ready<Table["orm"]>;
export type UiKit = Exclude<Ready<Table["uiKit"]>, "none">;
export type Generator = Ready<Table["generators"]>;

/** The options of `choice` that init can make today. */
export function readyOptions<C extends Choice>(
  choice: C,
): (Option & { value: Ready<C> })[] {
  return choice.options.filter(
    (option): option is Option & { value: Ready<C> } => !option.comingLater,
  );
}

type NonEmpty<T> = [T, ...T[]];

/** Everything init asks, as `robkit.json` records it. */
export interface Choices {
  orm: Orm;
  /**
   * The shared React UI kit, or `null` when the hub and admin are plain
   * JSX and Tailwind, which `--ui-kit none` asks for.
   */
  uiKit: UiKit | null;
  /** The stacks `robkit add` offers. The first one makes the example app. */
  generators: NonEmpty<Generator>;
}

export const defaultChoices: Choices = {
  orm: "drizzle",
  uiKit: null,
  generators: ["start", "react-hono"],
};

/** init's flags, as `node:util`'s `parseArgs` reads them. */
export type Flags = {
  [Name in ChoiceName as Table[Name]["flag"]]?: string | undefined;
};

function oneOf<C extends Choice>(choice: C, value: string): Ready<C> {
  const ready = readyOptions(choice).map((option) => option.value);
  const option = ready.find((candidate) => candidate === value);
  if (!option) {
    throw new Error(
      `--${choice.flag} ${value} isn't an option. Choose from: ${ready.join(", ")}.`,
    );
  }
  return option;
}

function listOf<C extends Choice>(choice: C, value: string): Ready<C>[] {
  // split always returns at least one item, even for an empty string.
  const list = value.split(",").map((item) => oneOf(choice, item));
  if (new Set(list).size !== list.length) {
    throw new Error(`--${choice.flag} ${value} names an option twice.`);
  }
  return list;
}

/** A list as its flag spells it, which choicesFromFlags reads back. */
export function listFlag(list: readonly string[]): string {
  return list.join(",");
}

/** The choices init's flags make, with a default for each flag left out. */
export function choicesFromFlags(flags: Flags): Choices {
  const t = choiceTable;
  const given = (choice: Choice) =>
    flags[choice.flag as keyof Flags] ?? undefined;
  const orm = given(t.orm);
  const uiKit = given(t.uiKit);
  const generators = given(t.generators);
  const kit = uiKit === undefined ? "none" : oneOf(t.uiKit, uiKit);
  return {
    orm: orm === undefined ? defaultChoices.orm : oneOf(t.orm, orm),
    uiKit: kit === "none" ? null : kit,
    generators:
      generators === undefined
        ? defaultChoices.generators
        : // A list always has at least one item.
          (listOf(t.generators, generators) as NonEmpty<Generator>),
  };
}
