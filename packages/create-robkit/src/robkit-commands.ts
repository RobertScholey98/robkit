const commands = [
  "add",
  "check",
  "migrate",
  "upgrade",
  "vendor",
  "database-urls",
  "deploy",
] as const;

/** One of `robkit`'s commands. */
export type RobkitCommand = (typeof commands)[number];

/**
 * The commands `robkit` runs, as `robkit <command>`. Importing this runs
 * nothing, so a check can hold docs to the list: the docs site's checks
 * fail on a `pnpm robkit <command>` that isn't here. Published as a plain
 * list, so a command added here changes no type.
 */
export const robkitCommands: readonly string[] = commands;

/** Whether `name` is one of `robkit`'s commands. */
export const isRobkitCommand = (name: string): name is RobkitCommand =>
  robkitCommands.includes(name);
