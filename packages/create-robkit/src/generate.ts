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

/** npm drops these from a published package, so templates store them renamed. */
const storedAs = new Map([["gitignore", ".gitignore"]]);

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
    files.set(storedAs.get(path) ?? path, text);
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
    layerOf(t.packageManager, choices.packageManager),
    layerOf(t.orm, choices.orm),
    // `Choices` has no UI kit to read until one is ready, so the hub and
    // admin come from the no-kit option's layer.
    layerOf(t.uiKit, "none"),
    ...choices.tools.map((tool) => layerOf(t.tools, tool)),
  ].filter((layer) => layer !== undefined);
}

/** The install scripts every answer in `choices` needs, by dependency. */
function buildsFor(choices: Choices): Record<string, boolean> {
  const t = choiceTable;
  const answers: [Choice, string][] = [
    [t.packageManager, choices.packageManager],
    [t.orm, choices.orm],
    ...choices.tools.map((tool): [Choice, string] => [t.tools, tool]),
    ...choices.generators.map((stack): [Choice, string] => [
      t.generators,
      stack,
    ]),
  ];
  return Object.fromEntries(
    answers.flatMap(([choice, value]) =>
      Object.entries(optionOf(choice, value)?.builds ?? {}),
    ),
  );
}

/**
 * The template robkit ships for `stack`: an app's files, from its folder,
 * with the install's ORM's app files laid over them. Its `AGENTS.md` ends
 * with the section the ORM adds.
 */
export async function stackTemplate(
  stack: Generator,
  orm: Orm,
): Promise<Files> {
  const layer = layerOf(choiceTable.generators, stack);
  if (layer === undefined) {
    throw new Error(`the ${stack} stack has no template`);
  }
  const files = await readLayer(layer);
  const ormOption: Option | undefined = choiceTable.orm.options.find(
    (option) => option.value === orm,
  );
  const appLayer = ormOption?.appLayer;
  if (appLayer !== undefined) overlay(files, await readLayer(appLayer));
  const guide = ormOption?.appGuide;
  const agents = files.get("AGENTS.md");
  if (guide !== undefined && agents !== undefined) {
    // A Windows checkout may hold the templates with CRLF endings.
    const section = (
      await readFile(join(templatesDir, guide), "utf8")
    ).replaceAll("\r\n", "\n");
    files.set("AGENTS.md", `${agents}\n${section}`);
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

/**
 * Writes the catalog, the install scripts pnpm may run, and the links to
 * robkit's packages when asked.
 */
async function renderPnpm(
  files: Files,
  names: string[],
  builds: Record<string, boolean>,
  repo: RobkitRepo,
  { link = false }: GenerateOptions,
): Promise<void> {
  const workspace = parseDocument(files.get("pnpm-workspace.yaml") ?? "");
  for (const [name, allowed] of Object.entries(builds)) {
    workspace.setIn(["allowBuilds", name], allowed);
  }
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

  const stacks = await Promise.all(
    choices.generators.map((stack) => stackTemplate(stack, choices.orm)),
  );
  const [example] = stacks;
  if (example === undefined) throw new Error("init needs a generator");
  overlay(files, appFiles(example, exampleSlug), `apps/${exampleSlug}/`);

  // The catalog covers every stack robkit add offers, so adding an app
  // needs no version the install lacks.
  const names = catalogued([
    ...files,
    ...stacks.flatMap((stack) => [...stack]),
  ]);
  await renderPnpm(
    files,
    names,
    buildsFor(choices),
    await readRobkitRepo(),
    options,
  );
  files.set(
    "robkit.json",
    await format(JSON.stringify(choices), { filepath: "robkit.json" }),
  );
  return new Map([...files].sort(([a], [b]) => (a < b ? -1 : 1)));
}
