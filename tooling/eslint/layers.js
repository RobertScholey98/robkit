import { builtinModules } from "node:module";
import { matchesGlob } from "node:path/posix";

/**
 * @typedef {object} LayerRow
 * @property {string[] | ((workspace: string) => boolean)} workspaces
 *   globs over the workspace path from the repo root, such as `packages/*`
 * @property {string} rule the message ESLint prints, naming the rule
 * @property {string[]} imports gitignore-style patterns the workspace may not import
 * @property {string[]} [importNames] if set, only these names from `imports` are banned
 * @property {string[]} [globals] globals the workspace may not use
 */

// A leading slash anchors a bare name, so `/react` matches `react` and
// `react/jsx-runtime` but not `@robkit/react`.
const frameworks = [
  "/hono",
  "@hono/*",
  "/react",
  "/react-dom",
  "@tanstack/*",
  "/next",
  "/express",
];

const nodeBuiltins = builtinModules.flatMap((name) =>
  name.startsWith("node:") ? [name] : [`/${name}`, `node:${name}`],
);

/** @type {LayerRow[]} */
export const layers = [
  {
    workspaces: ["packages/session"],
    rule: "Layer rule: @robkit/session imports no framework.",
    imports: frameworks,
  },
  {
    workspaces: ["packages/guard"],
    rule: "Layer rule: @robkit/guard imports no framework.",
    imports: frameworks,
  },
  {
    workspaces: ["packages/guard"],
    rule: "Layer rule: @robkit/guard does no I/O.",
    imports: nodeBuiltins,
    globals: ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "process"],
  },
  {
    workspaces: ["packages/hono", "packages/start", "packages/react"],
    rule: "Layer rule: adapters never import @robkit/core. Code reaches core over HTTP only.",
    imports: ["@robkit/core"],
  },
  {
    workspaces: ["packages/*"],
    rule: "Layer rule: packages never import from apps or examples.",
    // From packages/<name>, one `..` only reaches packages/, so a path into
    // the repo's apps/ or examples/ climbs at least twice.
    imports: ["@internal/*-app", "../../**/apps/**", "../../**/examples/**"],
  },
  {
    workspaces: (workspace) =>
      matchesGlob(workspace, "apps/*") && workspace !== "apps/core",
    rule: "Layer rule: only apps/core imports @robkit/core. Code reaches core over HTTP only.",
    imports: ["@robkit/core"],
  },
  {
    workspaces: ["packages/core"],
    rule: "Layer rule: core's tables live in the core schema. Declare them with core.table() from schema.ts.",
    imports: ["drizzle-orm/pg-core"],
    importNames: ["pgTable"],
  },
];

/**
 * Merges every layer row that applies to `workspace` into one config object.
 * A later `no-restricted-imports` replaces an earlier one, so the rows can't
 * each bring their own.
 * @param {string} workspace path from the repo root, such as `packages/guard`
 * @returns {import("eslint").Linter.Config}
 */
export function layerConfig(workspace) {
  const rows = layers.filter(({ workspaces }) =>
    typeof workspaces === "function"
      ? workspaces(workspace)
      : workspaces.some((glob) => matchesGlob(workspace, glob)),
  );
  const patterns = rows.map(({ imports, importNames, rule }) => ({
    group: imports,
    ...(importNames && { importNames }),
    message: rule,
  }));
  const globals = rows.flatMap(({ globals = [], rule }) =>
    globals.map((name) => ({ name, message: rule })),
  );

  return {
    rules: {
      ...(patterns.length > 0 && {
        "no-restricted-imports": ["error", { patterns }],
      }),
      ...(globals.length > 0 && {
        "no-restricted-globals": ["error", ...globals],
      }),
    },
  };
}
