import { glob, readdir, readFile } from "node:fs/promises";
import { extname, join, posix } from "node:path";
import { matchesGlob } from "node:path/posix";
import ts from "typescript";
import type { PackageGraph } from "@internal/eslint-config/package-graph";
import { reachesOutside } from "@internal/eslint-config/layers";
import {
  packageFolders,
  toolchain,
} from "@internal/eslint-config/package-graph";
import { readJsonFile, readNamedManifest } from "./manifest.ts";

type Deps = Record<string, string> | undefined;

/** A package in this workspace. */
export interface WorkspacePackage {
  name: string;
  /** Its folder from the repo root, such as `packages/guard`. */
  folder: string;
  manifest: {
    /** A private package is never published, so it has no runtime code. */
    private?: boolean;
    dependencies?: Deps;
    devDependencies?: Deps;
    peerDependencies?: Deps;
    optionalDependencies?: Deps;
  };
}

/** An import in a file, as the file spells it. */
export interface ImportSite {
  /** The file, from the repo root. */
  file: string;
  line: number;
  specifier: string;
}

const graphFile = "tooling/eslint/package-graph.js";

/** Every package the workspace's globs find, sorted by folder. */
export async function readWorkspace(root: string): Promise<WorkspacePackage[]> {
  const found: WorkspacePackage[] = [];
  for await (const path of glob(
    packageFolders.map((folder) => `${folder}/package.json`),
    { cwd: root },
  )) {
    const manifest = await readJsonFile(join(root, path), readNamedManifest);
    found.push({
      name: manifest.name,
      folder: posix.dirname(path.replaceAll("\\", "/")),
      manifest,
    });
  }
  return found.sort((a, b) => a.folder.localeCompare(b.folder));
}

/** The package a bare specifier names: `@robkit/guard/x` is `@robkit/guard`. */
function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return parts.slice(0, specifier.startsWith("@") ? 2 : 1).join("/");
}

/** What a package's graph entry lets it depend on, in one manifest field. */
function allowed(
  graph: PackageGraph,
  name: string,
  field: "dependencies" | "devDependencies",
): readonly string[] {
  const edges = graph[name];
  if (edges === undefined) return [];
  return field === "dependencies"
    ? edges.dependencies
    : [...edges.devDependencies, ...edges.dependencies, ...toolchain];
}

/**
 * Where the manifests and the graph disagree: a package the graph doesn't
 * name, a workspace dependency it doesn't allow, or an edge it declares that
 * no manifest has.
 */
export function manifestProblems(
  graph: PackageGraph,
  packages: readonly WorkspacePackage[],
): string[] {
  const names = new Set(packages.map((pkg) => pkg.name));
  const problems: string[] = [];
  for (const name of Object.keys(graph)) {
    if (!names.has(name)) {
      problems.push(
        `${graphFile} names ${name}, which isn't a workspace package`,
      );
    }
  }
  for (const { name, folder, manifest } of packages) {
    const edges = graph[name];
    if (edges === undefined) {
      problems.push(`${folder}: ${name} isn't in ${graphFile}`);
      continue;
    }
    const fields = [
      ["dependencies", "dependencies"],
      ["optionalDependencies", "dependencies"],
      ["peerDependencies", "dependencies"],
      ["devDependencies", "devDependencies"],
    ] as const;
    for (const [field, edgeKind] of fields) {
      for (const dep of Object.keys(manifest[field] ?? {})) {
        if (!names.has(dep) || allowed(graph, name, edgeKind).includes(dep)) {
          continue;
        }
        problems.push(
          `${folder}/package.json: ${field} has ${dep}, which ${graphFile} doesn't let ${name} depend on`,
        );
      }
    }
    for (const [edgeKind, manifestFields] of [
      [
        "dependencies",
        ["dependencies", "optionalDependencies", "peerDependencies"],
      ],
      ["devDependencies", ["devDependencies"]],
    ] as const) {
      for (const dep of edges[edgeKind]) {
        if (manifestFields.some((field) => dep in (manifest[field] ?? {}))) {
          continue;
        }
        problems.push(
          `${graphFile} lets ${name} take ${dep} in ${edgeKind}, but ${folder}/package.json doesn't`,
        );
      }
    }
  }
  return problems;
}

/**
 * Whether a file is code a published package runs: under `src`, and not a
 * test, a test helper under `src/test` or a snapshot. Config files sit
 * beside `src`, and a private package has no runtime code at all.
 */
export function isRuntimeFile(pkg: WorkspacePackage, file: string): boolean {
  if (pkg.manifest.private === true) return false;
  const inside = posix.relative(pkg.folder, file);
  return (
    inside.startsWith("src/") &&
    !/\.test(-d)?\.[cm]?[jt]sx?$/.test(inside) &&
    !/^src\/(.+\/)?(test|__snapshots__)\//.test(inside)
  );
}

/**
 * Imports that leave their package other than through a dependency the graph
 * allows: a workspace package it doesn't list, a dev-only package imported
 * from runtime code, or a relative path into another folder.
 */
export function importProblems(
  graph: PackageGraph,
  pkg: WorkspacePackage,
  packages: readonly WorkspacePackage[],
  imports: readonly ImportSite[],
): string[] {
  const names = new Set(packages.map(({ name }) => name));
  const mayUse = new Set([
    pkg.name,
    ...allowed(graph, pkg.name, "devDependencies"),
  ]);
  const runtime = new Set([
    pkg.name,
    ...allowed(graph, pkg.name, "dependencies"),
  ]);
  return imports.flatMap(({ file, line, specifier }) => {
    const at = `${file}:${String(line)}`;
    if (/^\.\.?(\/|$)/.test(specifier)) {
      const target = posix.join(posix.dirname(file), specifier);
      return target === pkg.folder || target.startsWith(`${pkg.folder}/`)
        ? []
        : [`${at} ${reachesOutside(pkg.folder, specifier)}`];
    }
    const name = packageName(specifier);
    if (!names.has(name)) return [];
    if (!mayUse.has(name)) {
      return [
        `${at} imports ${name}, which ${graphFile} doesn't let ${pkg.name} depend on`,
      ];
    }
    return isRuntimeFile(pkg, file) && !runtime.has(name)
      ? [
          `${at} imports ${name}, which ${graphFile} lets ${pkg.name} take only in tests and config`,
        ]
      : [];
  });
}

/** A row of the `layer` ESLint rule, as `@internal/eslint-config/layers` declares it. */
export interface LayerRow {
  applies: (workspace: string) => boolean;
  rule: string;
  modules?: string[];
  folders?: string[];
}

/** An edge between workspace packages that a layer row forbids. */
export interface ForbiddenEdge {
  from: string;
  to: string;
  rule: string;
}

/** Every edge between workspace packages that the `layer` ESLint rule forbids. */
export function layerForbids(
  packages: readonly WorkspacePackage[],
  layers: readonly LayerRow[],
): ForbiddenEdge[] {
  return packages.flatMap((from) =>
    layers
      .filter((row) => row.applies(from.folder))
      .flatMap((row) =>
        packages
          .filter(
            (to) =>
              to !== from &&
              ((row.modules ?? []).some(
                (module) => to.name === module || matchesGlob(to.name, module),
              ) ||
                (row.folders ?? []).includes(to.folder)),
          )
          .map((to) => ({ from: from.name, to: to.name, rule: row.rule })),
      ),
  );
}

/** Each edge the graph allows that the `layer` ESLint rule forbids. */
export function layerConflicts(
  graph: PackageGraph,
  forbidden: readonly ForbiddenEdge[],
): string[] {
  return forbidden
    .filter(({ from, to }) =>
      allowed(graph, from, "devDependencies").includes(to),
    )
    .map(
      ({ from, to, rule }) =>
        `${graphFile} lets ${from} depend on ${to}, which the layer ESLint rule forbids: ${rule}`,
    );
}

/** Each cycle in the graph, as the path that closes it. */
export function cycles(graph: PackageGraph): string[] {
  const found: string[] = [];
  const done = new Set<string>();
  const visit = (name: string, path: readonly string[]): void => {
    const start = path.indexOf(name);
    if (start !== -1) {
      found.push([...path.slice(start), name].join(" -> "));
      return;
    }
    if (done.has(name)) return;
    const edges = graph[name];
    for (const next of [
      ...(edges?.dependencies ?? []),
      ...(edges?.devDependencies ?? []),
    ]) {
      visit(next, [...path, name]);
    }
    done.add(name);
  };
  for (const name of Object.keys(graph).sort()) visit(name, []);
  return found;
}

const scriptExtensions = new Set([
  ".ts",
  ".mts",
  ".cts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
]);

/** Folders that hold no code this workspace's packages run. */
const skipped = new Set(["node_modules", "dist", "coverage"]);

/**
 * An install's own files, which import `@robkit/*` as an install does. The
 * install's `robkit check` covers them.
 */
const notWorkspaceCode = new Set(["packages/create-robkit/templates"]);

/** The imports in one file's text. */
export function importsIn(file: string, text: string): ImportSite[] {
  const { importedFiles } = ts.preProcessFile(text, true, true);
  return importedFiles.map(({ fileName, pos }) => ({
    file,
    line: text.slice(0, pos).split("\n").length,
    specifier: fileName,
  }));
}

/** Every import in the scripts under `folder`, a path from `root`. */
export async function importsUnder(
  root: string,
  folder: string,
): Promise<ImportSite[]> {
  const sites: ImportSite[] = [];
  const entries = await readdir(join(root, folder), { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = `${folder}/${entry.name}`;
    if (entry.isDirectory()) {
      if (
        !skipped.has(entry.name) &&
        !entry.name.startsWith(".") &&
        !notWorkspaceCode.has(path)
      ) {
        sites.push(...(await importsUnder(root, path)));
      }
    } else if (scriptExtensions.has(extname(entry.name))) {
      sites.push(...importsIn(path, await readFile(join(root, path), "utf8")));
    }
  }
  return sites;
}
