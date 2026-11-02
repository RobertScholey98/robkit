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
