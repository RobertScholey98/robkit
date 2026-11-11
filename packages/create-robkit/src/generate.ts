import { readdir, readFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { isRecord } from "@robkit/input";
import { type AppManifest, appManifestJson } from "@robkit/input/manifest";
import { jsonObject, stringsIn } from "./json.ts";
import { format } from "prettier";
import { parseDocument } from "yaml";
import { readyStacks, type Choices, type Stack } from "./choices.ts";
import {
  goModuleFor,
  vendoredGoDir,
  vendoredGoModule,
  withGoModule,
} from "./go-module.ts";
import {
  readRobkitRepo,
  withDependencies,
  type RobkitRepo,
} from "./robkit-repo.ts";

/** An install in memory: each file's path from the install root, and its text. */
export type Files = Map<string, string>;

/**
 * An app's files, which may come from the owner's own template: each
 * file's text, or its bytes where they aren't UTF-8 text, such as an
 * image's.
 */
export type AppFiles = Map<string, string | Uint8Array>;

/** The text of the file at `path` in `files`, or undefined if it has none. */
export function textIn(files: AppFiles, path: string): string | undefined {
  const content = files.get(path);
  return typeof content === "string" ? content : undefined;
}

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

/** Every file under `dir`, as `read` reads it, by its path from `dir`. */
async function readEach<T>(
  dir: string,
  read: (bytes: Buffer) => T,
): Promise<Map<string, T>> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = new Map<string, T>();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const file = join(entry.parentPath, entry.name);
    const path = relative(dir, file).replaceAll("\\", "/");
    files.set(restored(path), read(await readFile(file)));
  }
  return files;
}

// A Windows checkout may hold text with CRLF endings, which an install
// doesn't keep.
const lf = (text: string) => text.replaceAll("\r\n", "\n");

/** Every file under `dir`, robkit's own text, by its path from `dir`. */
export function readFolder(dir: string): Promise<Files> {
  return readEach(dir, (bytes) => lf(bytes.toString("utf8")));
}

// Fails on bytes that aren't UTF-8, and keeps a byte order mark.
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/**
 * Every file under `dir`, a template the owner keeps in their install, by
 * its path from `dir`. A file that isn't UTF-8 text, such as an image,
 * keeps its bytes.
 */
export function readOwnTemplate(dir: string): Promise<AppFiles> {
  return readEach(dir, (bytes): string | Uint8Array => {
    try {
      return lf(utf8.decode(bytes));
    } catch {
      // Not text, so it arrives byte for byte.
      return bytes;
    }
  });
}

const toJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

function editJson(files: AppFiles, path: string, edit: (json: Json) => Json) {
  const text = textIn(files, path);
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
 * A stack's page titles itself with the example's slug, in one of these
 * forms: an HTML or JSX `<title>`, or a `title` that Next's metadata or
 * Start's head names.
 */
const titledExample = new RegExp(
  `<title>${exampleSlug}</title>|title: "${exampleSlug}"`,
  "g",
);

/** `text` with the page's title, the example's slug, swapped for `slug`. */
function titledWith(text: string, slug: string): string {
  return text.replace(titledExample, (title) =>
    title.replace(exampleSlug, slug),
  );
}

/**
 * The files of an app at `apps/<slug>` made from a stack's template, by
 * their path from the app's folder. Its manifest is named after the slug,
 * and carries what the app declares, if anything. Its page is titled with
 * the slug.
 */
export function appFiles<Content extends string | Uint8Array>(
  template: Map<string, Content>,
  slug: string,
  manifest: AppManifest = {},
): Map<string, Content | string> {
  const files = new Map<string, Content | string>(
    [...template].map(([path, content]) => [
      path,
      typeof content === "string" ? titledWith(content, slug) : content,
    ]),
  );
  editJson(files, "package.json", (json) => ({
    name: `@internal/${slug}-app`,
    ...json,
    ...(Object.keys(manifest).length > 0 && {
      robkit: appManifestJson(manifest),
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

/** The overrides in `text`, pnpm's settings, by package name. */
export function overridesIn(text: string): Record<string, string> {
  const settings: unknown = parseDocument(text).toJS();
  return isRecord(settings) ? stringsIn(settings.overrides) : {};
}

/**
 * The catalog an install needs from `repo`, by name: every dependency its
 * base and every stack robkit add offers take from the catalog, so adding
 * an app needs no version the install lacks.
 */
export async function installCatalog(
  repo: RobkitRepo,
): Promise<Map<string, string>> {
  const base = await readFolder(join(templatesDir, "base"));
  const stacks = await Promise.all(readyStacks.map(stackTemplate));
  const names = catalogued([...base, ...stacks.flatMap((stack) => [...stack])]);
  return new Map(names.map((name) => [name, versionOf(repo, name)]));
}

/**
 * Writes pnpm's settings: the catalog, and the links to robkit's packages
 * when asked. Then names pnpm's version in
 * the root manifest.
 */
async function renderSettings(files: Files, repo: RobkitRepo): Promise<void> {
  const workspace = parseDocument(files.get(pnpmSettings) ?? "");
  const catalog = await installCatalog(repo);
  workspace.set("catalog", Object.fromEntries(catalog));
  // With --link, every robkit package the install runs on, named or not,
  // so pnpm asks npm for none of them.
  for (const name of withDependencies(catalog.keys(), repo.packages)) {
    const dir = repo.links.get(name);
    if (dir === undefined) continue;
    workspace.setIn(["overrides", name], `link:${dir.replaceAll("\\", "/")}`);
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

/** Where an install keeps robkit's lint policy, from its root. */
const lintPolicyDir = "tooling/eslint";

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

  const repo = await readRobkitRepo(options);
  await renderSettings(files, repo);
  const goModule = goModuleFor(overridesIn(files.get(pnpmSettings) ?? ""));
  const goApps = [...files.keys()].filter((path) =>
    /^apps\/[^/]+\/go\.mod$/.test(path),
  );
  for (const path of goApps) {
    files.set(path, withGoModule(files.get(path) ?? "", goModule));
  }
  // An install that isn't linked carries robkit's Go module for its Go
  // apps, so none waits on a module proxy for it.
  if (goApps.length > 0 && goModule === vendoredGoModule) {
    for (const [path, text] of repo.goModule) {
      files.set(`${vendoredGoDir}/${path}`, text);
    }
  }
  // The install lints with the policy robkit lints itself with.
  for (const [name, text] of repo.lintPolicy) {
    files.set(`${lintPolicyDir}/${name}`, text);
  }
  files.set(
    "robkit.json",
    await format(JSON.stringify(choices), { filepath: "robkit.json" }),
  );
  return new Map([...files].sort(([a], [b]) => (a < b ? -1 : 1)));
}
