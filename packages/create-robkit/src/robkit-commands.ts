/**
 * The commands `robkit` runs, as `robkit <command>`. Importing this runs
 * nothing, so a check can hold docs to the list: the docs site's checks
 * fail on a `pnpm robkit <command>` that isn't here.
 */
export const robkitCommands = [
  "add",
  "check",
  "migrate",
  "upgrade",
  "vendor",
  "database-urls",
  "deploy",
] as const;

/** One of `robkit`'s commands. */
export type RobkitCommand = (typeof robkitCommands)[number];

/** Whether `name` is one of `robkit`'s commands. */
export const isRobkitCommand = (name: string): name is RobkitCommand =>
  (robkitCommands as readonly string[]).includes(name);
