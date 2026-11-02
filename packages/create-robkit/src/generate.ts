import { readdir, readFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { parseDocument } from "yaml";
import type { Choices } from "./choices.ts";
import { readRobkitRepo, type RobkitRepo } from "./robkit-repo.ts";

/** An install in memory: each file's path from the install root, and its text. */
export type Files = Map<string, string>;

export interface GenerateOptions {
  /**
   * Link the `@robkit/*` packages to this robkit checkout instead of
   * installing them from npm.
   */
  link?: boolean;
}

/** The slug init gives the app it adds from the first generator. */
export const exampleSlug = "example";

const templatesDir = fileURLToPath(new URL("../templates/", import.meta.url));

/** npm drops these from a published package, so templates store them renamed. */
const storedAs = new Map([["gitignore", ".gitignore"]]);

type Json = Record<string, unknown>;

async function readLayer(layer: string): Promise<Files> {
  const dir = join(templatesDir, layer);
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files: Files = new Map();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const file = join(entry.parentPath, entry.name);
    const path = relative(dir, file).replaceAll("\\", "/");
    // A Windows checkout may hold the templates with CRLF endings.
    const text = (await readFile(file, "utf8")).replaceAll("\r\n", "\n");
    files.set(storedAs.get(path) ?? path, text);
  }
  return files;
}

function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge(base: Json, over: Json): Json {
  const merged = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const current = merged[key];
    merged[key] =
      isJson(current) && isJson(value) ? deepMerge(current, value) : value;
  }
  return merged;
}

const toJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** Merges two manifests, keeping each dependency list in name order. */
function mergeManifests(base: string, over: string): string {
  const merged = deepMerge(JSON.parse(base) as Json, JSON.parse(over) as Json);
  for (const field of ["dependencies", "devDependencies"]) {
    const deps = merged[field];
    if (isJson(deps)) {
      merged[field] = Object.fromEntries(
        Object.entries(deps).sort(([a], [b]) => (a < b ? -1 : 1)),
      );
    }
  }
  return toJson(merged);
}

/**
 * Lays `layer` over `files` under `prefix`. A later layer's file replaces an
 * earlier one, except a manifest, which merges into it so each layer can add
 * its own scripts and dependencies.
 */
function overlay(files: Files, layer: Files, prefix = ""): void {
  for (const [path, text] of layer) {
    const target = prefix + path;
    const existing = files.get(target);
    files.set(
      target,
      existing !== undefined && basename(target) === "package.json"
        ? mergeManifests(existing, text)
        : text,
    );
  }
}

function editJson(files: Files, path: string, edit: (json: Json) => Json) {
  const text = files.get(path);
  if (text === undefined) throw new Error(`the install has no ${path}`);
  files.set(path, toJson(edit(JSON.parse(text) as Json)));
}

/** The template folders for `choices`, in the order they're laid down. */
function layersFor(choices: Choices): string[] {
  // Drizzle has no layer yet: core keeps it inside @robkit/core, and the
  // example apps query Postgres directly. No UI kit exists yet either, so
  // the hub and admin always come from the no-kit layer.
  return [
    "base",
    `package-managers/${choices.packageManager}`,
    "ui-kits/none",
    ...choices.tools.map((tool) => `tools/${tool}`),
  ];
}

/** Every dependency the install's manifests take from the catalog. */
function catalogued(files: Files): string[] {
  const names = new Set<string>();
  for (const [path, text] of files) {
    if (basename(path) !== "package.json") continue;
    const json = JSON.parse(text) as Partial<
      Record<"dependencies" | "devDependencies", Record<string, string>>
    >;
    for (const deps of [json.dependencies, json.devDependencies]) {
      for (const [name, spec] of Object.entries(deps ?? {})) {
        if (spec === "catalog:") names.add(name);
      }
    }
  }
  return [...names].sort();
}

function versionOf(repo: RobkitRepo, name: string): string {
  const version = repo.catalog.get(name) ?? repo.packages.get(name)?.version;
  if (version === undefined) {
    throw new Error(`${name} has no version in robkit's catalog`);
  }
  return version;
}

/** Writes the catalog, and the links to robkit's packages when asked. */
async function renderPnpm(
  files: Files,
  repo: RobkitRepo,
  { link = false }: GenerateOptions,
): Promise<void> {
  const names = catalogued(files);
  const workspace = parseDocument(files.get("pnpm-workspace.yaml") ?? "");
  workspace.set(
    "catalog",
    Object.fromEntries(names.map((name) => [name, versionOf(repo, name)])),
  );
  if (link) {
    workspace.set(
      "overrides",
      Object.fromEntries(
        names.flatMap((name) => {
          const pkg = repo.packages.get(name);
          return pkg ? [[name, `link:${pkg.dir.replaceAll("\\", "/")}`]] : [];
        }),
      ),
    );
  }
  files.set(
    "pnpm-workspace.yaml",
    await format(workspace.toString(), { filepath: "pnpm-workspace.yaml" }),
  );
  editJson(files, "package.json", (json) => ({
    ...json,
    packageManager: repo.packageManager,
  }));
}

/** The install init writes for `choices`, file by file. */
export async function generateInstall(
  choices: Choices,
  options: GenerateOptions = {},
): Promise<Files> {
  const files: Files = new Map();
  for (const layer of layersFor(choices)) {
    overlay(files, await readLayer(layer));
  }

  const appDir = `apps/${exampleSlug}/`;
  overlay(files, await readLayer(`stacks/${choices.generators[0]}`), appDir);
  editJson(files, `${appDir}package.json`, (json) => ({
    name: `@internal/${exampleSlug}-app`,
    ...json,
  }));

  await renderPnpm(files, await readRobkitRepo(), options);
  files.set(
    "robkit.json",
    await format(JSON.stringify(choices), { filepath: "robkit.json" }),
  );
  return new Map([...files].sort(([a], [b]) => (a < b ? -1 : 1)));
}
