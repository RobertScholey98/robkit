import { globSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { matchesGlob, dirname as posixDirname } from "node:path/posix";
import { fileURLToPath } from "node:url";
import { packageGraph } from "./package-graph.js";

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

/**
 * Code reaches core over HTTP only, so no package imports `@robkit/core`
 * unless the package graph lets it: one row for each package it doesn't.
 * @param {import("./package-graph.js").PackageGraph} graph
 * @param {ReadonlyMap<string, string>} folders each package's folder, by name
 * @returns {LayerRow[]}
 */
export function coreRows(graph, folders) {
  return Object.entries(graph)
    .filter(
      ([name, { dependencies, devDependencies }]) =>
        name !== "@robkit/core" &&
        ![...dependencies, ...devDependencies].includes("@robkit/core"),
    )
    .flatMap(([name]) => {
      const folder = folders.get(name);
      return folder === undefined
        ? []
        : [
            {
              applies: (/** @type {string} */ workspace) =>
                workspace === folder,
              rule: `Layer rule: ${name} never imports @robkit/core. Code reaches core over HTTP only.`,
              modules: ["@robkit/core"],
              folders: ["packages/core"],
            },
          ];
    });
}

/** Each workspace package's folder from the repo root, by name. */
function workspaceFolders() {
  /** @type {Map<string, string>} */
  const folders = new Map();
  for (const path of globSync(
    ["packages/*/package.json", "tooling/*/package.json"],
    { cwd: repoRoot },
  )) {
    const manifest = JSON.parse(readFileSync(join(repoRoot, path), "utf8"));
    if (typeof manifest?.name === "string") {
      folders.set(manifest.name, posixDirname(path.replaceAll("\\", "/")));
    }
  }
  return folders;
}

const folders = workspaceFolders();

/** Every workspace's folder, such as `packages/guard`. */
const workspaces = new Set(folders.values());

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
    applies: inside("packages/input"),
    rule: "Layer rule: @robkit/input imports no framework.",
    modules: frameworks,
  },
  {
    applies: inside("packages/input"),
    rule: "Layer rule: @robkit/input does no I/O.",
    modules: builtinModules,
    globals: ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "process"],
  },
  ...coreRows(packageGraph, folders),
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
 * Where a relative `specifier` imported from `filename` points, from the
 * repo root, or undefined for a bare one.
 * @param {string} filename
 * @param {string} specifier
 */
function relativeTarget(filename, specifier) {
  if (!/^\.\.?(\/|$)/.test(specifier)) return undefined;
  return relative(repoRoot, resolve(dirname(filename), specifier)).replaceAll(
    "\\",
    "/",
  );
}

/**
 * Whether `specifier`, imported from `filename`, is one `row` forbids.
 * @param {LayerRow} row
 * @param {string} filename
 * @param {string} specifier
 */
function breaks(row, filename, specifier) {
  const target = relativeTarget(filename, specifier);
  if (target !== undefined) {
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
    const isWorkspace = workspaces.has(workspace);
    if (rows.length === 0 && !isWorkspace) return {};

    /** @param {import("estree").Node | null | undefined} source */
    function check(source) {
      if (source?.type !== "Literal" || typeof source.value !== "string") {
        return;
      }
      const specifier = source.value;
      const broken = rows.filter((row) =>
        breaks(row, context.filename, specifier),
      );
      for (const row of broken) {
        context.report({ node: source, message: row.rule });
      }
      // A row names its rule more closely, so this reports what none caught.
      const target = relativeTarget(context.filename, specifier);
      if (
        broken.length === 0 &&
        isWorkspace &&
        target !== undefined &&
        target !== workspace &&
        !target.startsWith(`${workspace}/`)
      ) {
        context.report({
          node: source,
          message: `Layer rule: this import ${reachesOutside(workspace, specifier)}`,
        });
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

/**
 * What a relative import that leaves its workspace breaks. `graph-check.ts`
 * in repo-checks prints it too.
 * @param {string} folder the workspace, such as `packages/guard`
 * @param {string} specifier the import, as the file spells it
 */
export function reachesOutside(folder, specifier) {
  return `reaches outside ${folder} with ${specifier}. Import the package by name.`;
}
