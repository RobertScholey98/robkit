import { readdir, readFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { parseDocument } from "yaml";
import {
  choiceTable,
  type Choice,
  type Choices,
  type Generator,
  type Option,
  type Orm,
  type UiKit,
} from "./choices.ts";
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
const exampleSlug = "example";

const templatesDir = fileURLToPath(new URL("../templates/", import.meta.url));

/**
 * npm drops these from a published package, in any folder, so templates
 * store them renamed.
 */
const storedAs = new Map([["gitignore", ".gitignore"]]);

/** `path` as the install names it, restoring a name npm would drop. */
function restored(path: string): string {
  const name = basename(path);
  const stored = storedAs.get(name);
  return stored === undefined
    ? path
    : `${path.slice(0, -name.length)}${stored}`;
}

type Json = Record<string, unknown>;

/** Every file under `dir`, by its path from `dir`. */
export async function readFolder(dir: string): Promise<Files> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files: Files = new Map();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const file = join(entry.parentPath, entry.name);
    const path = relative(dir, file).replaceAll("\\", "/");
    // A Windows checkout may hold the templates with CRLF endings.
    const text = (await readFile(file, "utf8")).replaceAll("\r\n", "\n");
    files.set(restored(path), text);
  }
  return files;
}

function readLayer(layer: string): Promise<Files> {
  return readFolder(join(templatesDir, layer));
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

/** The table's entry for one choice's answer. */
function optionOf(choice: Choice, value: string): Option | undefined {
  return choice.options.find((option) => option.value === value);
}

/** The template folder the table gives one choice's answer, if it adds one. */
function layerOf(choice: Choice, value: string): string | undefined {
  return optionOf(choice, value)?.layer;
}

/** The template folders for `choices`, in the order they're laid down. */
function layersFor(choices: Choices): string[] {
  const t = choiceTable;
  return [
    "base",
    layerOf(t.orm, choices.orm),
    // The hub and admin, then the kit's controls over them.
    layerOf(t.uiKit, "none"),
    choices.uiKit === null ? undefined : layerOf(t.uiKit, choices.uiKit),
  ].filter((layer) => layer !== undefined);
}

/** A file under `templates/`, with LF endings. */
async function readTemplate(path: string): Promise<string> {
  // A Windows checkout may hold the templates with CRLF endings.
  return (await readFile(join(templatesDir, path), "utf8")).replaceAll(
    "\r\n",
    "\n",
  );
}

/**
 * The template robkit ships for `stack`: an app's files, from its folder,
 * with the install's ORM's app files laid over them, and the UI kit's when
 * the app uses one. Its `AGENTS.md` ends with the section the ORM adds.
 */
export async function stackTemplate(
  stack: Generator,
  orm: Orm,
  uiKit: UiKit | null = null,
): Promise<Files> {
  const layer = layerOf(choiceTable.generators, stack);
  if (layer === undefined) {
    throw new Error(`the ${stack} stack has no template`);
  }
  const files = await readLayer(layer);
  const ormOption = optionOf(choiceTable.orm, orm);
  const appLayer = ormOption?.appLayer;
  if (appLayer !== undefined) overlay(files, await readLayer(appLayer));
  const kitLayer =
    uiKit === null ? undefined : optionOf(choiceTable.uiKit, uiKit)?.optInLayer;
  if (kitLayer !== undefined) {
    overlay(files, await readLayer(`${kitLayer}/${stack}`));
  }
  const guide = ormOption?.appGuide;
  const agents = files.get("AGENTS.md");
  if (guide !== undefined && agents !== undefined) {
    files.set("AGENTS.md", `${agents}\n${await readTemplate(guide)}`);
  }
  return files;
}

/**
 * What an app's manifest declares for core's catalog, in its `robkit`
 * field: who may open it once core adds it, with roles named, and the emoji
 * the launcher shows.
 */
export interface Declares {
  access?:
    { kind: "open" } | { kind: "owner" } | { kind: "roles"; roles: string[] };
  icon?: string;
}

/** The icon an app gets when nobody picks one, the example app included. */
export const defaultIcon = "📦";

/**
 * The files of an app at `apps/<slug>` made from a stack's template, by
 * their path from the app's folder. Its manifest is named after the slug,
 * and carries what the app declares, if anything.
 */
export function appFiles(
  template: Files,
  slug: string,
  declares: Declares = {},
): Files {
  const files: Files = new Map(template);
  editJson(files, "package.json", (json) => ({
    name: `@internal/${slug}-app`,
    ...json,
    ...(Object.keys(declares).length > 0 && { robkit: declares }),
  }));
  return files;
}

/** Every dependency the manifests among `files` take from the catalog. */
function catalogued(files: Iterable<[string, string]>): string[] {
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

/** Where pnpm keeps an install's settings. */
export const pnpmSettings = "pnpm-workspace.yaml";

/**
 * Writes pnpm's settings: the catalog, and the links to robkit's packages
 * when asked. Then names pnpm's version in
 * the root manifest.
 */
async function renderSettings(
  files: Files,
  names: string[],
  repo: RobkitRepo,
  { link = false }: GenerateOptions,
): Promise<void> {
  const workspace = parseDocument(files.get(pnpmSettings) ?? "");
  workspace.set(
    "catalog",
    Object.fromEntries(names.map((name) => [name, versionOf(repo, name)])),
  );
  for (const name of link ? names : []) {
    const pkg = repo.packages.get(name);
    if (pkg === undefined) continue;
    workspace.setIn(
      ["overrides", name],
      `link:${pkg.dir.replaceAll("\\", "/")}`,
    );
  }
  files.set(
    pnpmSettings,
    await format(workspace.toString(), { filepath: pnpmSettings }),
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

  const stacks = await Promise.all(
    // The example shows the install's UI kit off, if it has one.
    choices.generators.map((stack) =>
      stackTemplate(stack, choices.orm, choices.uiKit),
    ),
  );
  const [example] = stacks;
  if (example === undefined) throw new Error("init needs a generator");
  overlay(
    files,
    appFiles(example, exampleSlug, { icon: defaultIcon }),
    `apps/${exampleSlug}/`,
  );

  // The catalog covers every stack robkit add offers, so adding an app
  // needs no version the install lacks.
  const names = catalogued([
    ...files,
    ...stacks.flatMap((stack) => [...stack]),
  ]);
  await renderSettings(files, names, await readRobkitRepo(), options);
  files.set(
    "robkit.json",
    await format(JSON.stringify(choices), { filepath: "robkit.json" }),
  );
  return new Map([...files].sort(([a], [b]) => (a < b ? -1 : 1)));
}
