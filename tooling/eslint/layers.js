import { builtinModules } from "node:module";
import { dirname, relative, resolve } from "node:path";
import { matchesGlob } from "node:path/posix";
import { fileURLToPath } from "node:url";

export const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

/**
 * @typedef {object} LayerRow
 * @property {(workspace: string) => boolean} applies
 *   whether the row binds a workspace, given its path from the repo root
 * @property {string} rule the message ESLint prints, naming the rule
 * @property {string[]} [modules] bare specifiers the workspace may not import:
 *   a name also covers its subpaths, and a glob matches the package name
 * @property {string[]} [folders] folders, from the repo root, that the
 *   workspace's relative imports may not reach into
 * @property {string[]} [globals] globals the workspace may not use
 */

/** @param {...string} globs */
const inside =
  (...globs) =>
  (/** @type {string} */ workspace) =>
    globs.some((glob) => matchesGlob(workspace, glob));

const frameworks = [
  "hono",
  "@hono/*",
  "react",
  "react-dom",
  "@tanstack/*",
  "next",
  "express",
];

/** @type {LayerRow[]} */
export const layers = [
  {
    applies: inside("packages/session"),
    rule: "Layer rule: @robkit/session imports no framework.",
    modules: frameworks,
  },
  {
    applies: inside("packages/guard"),
    rule: "Layer rule: @robkit/guard imports no framework.",
    modules: frameworks,
  },
  {
    applies: inside("packages/guard"),
    rule: "Layer rule: @robkit/guard does no I/O.",
    modules: builtinModules,
    globals: ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "process"],
  },
  {
    applies: inside("packages/hono", "packages/start", "packages/react"),
    rule: "Layer rule: adapters never import @robkit/core. Code reaches core over HTTP only.",
    modules: ["@robkit/core"],
    folders: ["packages/core"],
  },
  {
    applies: inside("packages/*"),
    rule: "Layer rule: packages never import from apps or examples.",
    modules: ["@internal/*-app"],
    folders: ["apps", "examples"],
  },
  {
    applies: (workspace) =>
      matchesGlob(workspace, "apps/*") && workspace !== "apps/core",
    rule: "Layer rule: only apps/core imports @robkit/core. Code reaches core over HTTP only.",
    modules: ["@robkit/core"],
    folders: ["packages/core"],
  },
];

/** The workspace a file belongs to, such as `packages/guard`. */
export function workspaceOf(/** @type {string} */ filename) {
  return relative(repoRoot, filename)
    .replaceAll("\\", "/")
    .split("/")
    .slice(0, 2)
    .join("/");
}

/** @param {string} specifier */
function packageName(specifier) {
  const parts = specifier.split("/");
  return (specifier.startsWith("@") ? parts.slice(0, 2) : parts.slice(0, 1))
    .join("/")
    .replace(/^node:/, "");
}

/**
 * Whether `specifier`, imported from `filename`, is one `row` forbids.
 * @param {LayerRow} row
 * @param {string} filename
 * @param {string} specifier
 */
function breaks(row, filename, specifier) {
  if (/^\.\.?\//.test(specifier)) {
    const target = relative(
      repoRoot,
      resolve(dirname(filename), specifier),
    ).replaceAll("\\", "/");
    return (row.folders ?? []).some(
      (folder) => target === folder || target.startsWith(`${folder}/`),
    );
  }
  const name = packageName(specifier);
  const bare = specifier.replace(/^node:/, "");
  return (row.modules ?? []).some((module) => {
    const wanted = module.replace(/^node:/, "");
    return (
      bare === wanted ||
      bare.startsWith(`${wanted}/`) ||
      matchesGlob(name, wanted)
    );
  });
}

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: { description: "Enforce robkit's layer rule" },
    schema: [],
  },
  create(context) {
    const workspace = workspaceOf(context.filename);
    const rows = layers.filter((row) => row.applies(workspace));
    if (rows.length === 0) return {};

    /** @param {import("estree").Node | null | undefined} source */
    function check(source) {
      if (source?.type !== "Literal" || typeof source.value !== "string") {
        return;
      }
      const specifier = source.value;
      for (const row of rows) {
        if (breaks(row, context.filename, specifier)) {
          context.report({ node: source, message: row.rule });
        }
      }
    }

    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source),
      "Program:exit"(node) {
        const scope = context.sourceCode.getScope(node);
        for (const row of rows) {
          for (const name of row.globals ?? []) {
            const references = [
              ...(scope.set.get(name)?.references ?? []),
              ...scope.through.filter((ref) => ref.identifier.name === name),
            ];
            for (const { identifier } of references) {
              context.report({ node: identifier, message: row.rule });
            }
          }
        }
      },
    };
  },
};
