export const packageManagers = ["pnpm"] as const;
export const orms = ["drizzle"] as const;
export const tools = ["eslint-prettier"] as const;
/** The stacks `robkit add` can offer, in the order init lists them. */
export const generators = ["start", "react-hono"] as const;

export type PackageManager = (typeof packageManagers)[number];
export type Orm = (typeof orms)[number];
export type Tool = (typeof tools)[number];
export type Generator = (typeof generators)[number];

/** Everything init asks, as `robkit.json` records it. */
export interface Choices {
  packageManager: PackageManager;
  orm: Orm;
  /** No UI kit exists yet, so the hub and admin are plain JSX and Tailwind. */
  uiKit: null;
  tools: Tool[];
  /** The stacks `robkit add` offers. The first one makes the example app. */
  generators: [Generator, ...Generator[]];
}

export const defaultChoices: Choices = {
  packageManager: "pnpm",
  orm: "drizzle",
  uiKit: null,
  tools: ["eslint-prettier"],
  generators: ["start", "react-hono"],
};

/** init's flags, as `node:util`'s `parseArgs` reads them. */
export interface Flags {
  pm?: string | undefined;
  orm?: string | undefined;
  tools?: string | undefined;
  generators?: string | undefined;
}

function oneOf<T extends string>(
  flag: string,
  value: string,
  options: readonly T[],
): T {
  const option = options.find((candidate) => candidate === value);
  if (!option) {
    throw new Error(
      `--${flag} ${value} isn't an option. Choose from: ${options.join(", ")}.`,
    );
  }
  return option;
}

function listOf<T extends string>(
  flag: string,
  value: string,
  options: readonly T[],
): T[] {
  const list = value.split(",").map((item) => oneOf(flag, item, options));
  if (new Set(list).size !== list.length) {
    throw new Error(`--${flag} ${value} names an option twice.`);
  }
  return list;
}

/** The choices init's flags make, with a default for each flag left out. */
export function choicesFromFlags(flags: Flags): Choices {
  const [first, ...rest] =
    flags.generators === undefined
      ? defaultChoices.generators
      : listOf("generators", flags.generators, generators);
  if (!first) throw new Error("--generators needs at least one stack.");
  return {
    packageManager:
      flags.pm === undefined
        ? defaultChoices.packageManager
        : oneOf("pm", flags.pm, packageManagers),
    orm:
      flags.orm === undefined
        ? defaultChoices.orm
        : oneOf("orm", flags.orm, orms),
    uiKit: null,
    tools:
      flags.tools === undefined
        ? defaultChoices.tools
        : listOf("tools", flags.tools, tools),
    generators: [first, ...rest],
  };
}
