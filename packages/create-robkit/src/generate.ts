import { readdir, readFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type AppDeclaration,
  appDeclarationJson,
} from "@robkit/input/manifest";
import { jsonObject, stringsIn } from "./json.ts";
import { format } from "prettier";
import { parseDocument } from "yaml";
import { readyStacks, type Choices, type Stack } from "./choices.ts";
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

/** The slug of the app init adds on the example's stack. */
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

const toJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

function editJson(files: Files, path: string, edit: (json: Json) => Json) {
  const text = files.get(path);
  if (text === undefined) throw new Error(`the install has no ${path}`);
  files.set(path, toJson(edit(jsonObject(text, path))));
}

/** The template robkit ships for `stack`: an app's files, from its folder. */
export function stackTemplate(stack: Stack): Promise<Files> {
  return readFolder(join(templatesDir, "stacks", stack));
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
  declares: AppDeclaration = {},
): Files {
  const files: Files = new Map(template);
  editJson(files, "package.json", (json) => ({
    name: `@internal/${slug}-app`,
    ...json,
    ...(Object.keys(declares).length > 0 && {
      robkit: appDeclarationJson(declares),
    }),
  }));
  return files;
}

/** Every dependency the manifests among `files` take from the catalog. */
function catalogued(files: Iterable<[string, string]>): string[] {
  const names = new Set<string>();
  for (const [path, text] of files) {
    if (basename(path) !== "package.json") continue;
    const json = jsonObject(text, path);
    for (const deps of [json.dependencies, json.devDependencies]) {
      for (const [name, spec] of Object.entries(stringsIn(deps))) {
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
  const files = await readFolder(join(templatesDir, "base"));
  const example = appFiles(
    await stackTemplate(choices.exampleStack),
    exampleSlug,
    { icon: defaultIcon },
  );
  for (const [path, text] of example) {
    files.set(`apps/${exampleSlug}/${path}`, text);
  }

  // The catalog covers every stack robkit add offers, so adding an app
  // needs no version the install lacks.
  const stacks = await Promise.all(readyStacks.map(stackTemplate));
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
