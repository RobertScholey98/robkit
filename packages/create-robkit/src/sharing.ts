import { glob, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { parseDocument, type Document } from "yaml";
import type { Declares } from "./generate.ts";
import { pnpmSettings } from "./generate.ts";

/**
 * What export and import share: an app's files as a tree in memory, its
 * manifest, and the install's workspace packages and catalog. None of it
 * reads a stack's file layout, only manifests and imports.
 */

/** Files by their path from a folder, in `/` form, with their bytes. */
export type Tree = Map<string, Buffer>;

/** Folders that hold nothing an app's author wrote. */
const skippedFolders = new Set([
  ".git",
  "node_modules",
  "dist",
  ".turbo",
  ".tanstack",
  ".output",
  ".vinxi",
  ".nitro",
]);

/** Whether a file holds a secret or a build's leftovers, so never travels. */
function skippedFile(name: string): boolean {
  if (name === ".env.example") return false;
  return (
    name === ".env" ||
    name.startsWith(".env.") ||
    name.endsWith(".log") ||
    name.endsWith(".tsbuildinfo") ||
    name === ".DS_Store"
  );
}

/** Every file an author wrote under `dir`, leaving out installs and builds. */
export async function readTree(dir: string): Promise<Tree> {
  const tree: Tree = new Map();
  const walk = async (folder: string): Promise<void> => {
    const entries = await readdir(folder, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) {
        if (!skippedFolders.has(entry.name)) await walk(path);
      } else if (entry.isFile() && !skippedFile(entry.name)) {
        tree.set(
          relative(dir, path).replaceAll("\\", "/"),
          await readFile(path),
        );
      }
    }
  };
  await walk(dir);
  return new Map([...tree].sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** Writes `tree` into `dir`, making folders as it goes. */
export async function writeTree(dir: string, tree: Tree): Promise<void> {
  for (const [path, bytes] of tree) {
    const file = join(dir, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }
}

/** The files of `tree` under `folder`, by their path from it. */
export function subtree(tree: Tree, folder: string): Tree {
  const prefix = `${folder}/`;
  return new Map(
    [...tree].flatMap(([path, bytes]) =>
      path.startsWith(prefix) ? [[path.slice(prefix.length), bytes]] : [],
    ),
  );
}

/** The fields of a `package.json` that export and import read or change. */
export interface Manifest {
  name?: string;
  packageManager?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  robkit?: Declares;
  [field: string]: unknown;
}

/** The dependency lists whose versions export and import turn around. */
export const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
] as const;

export function parseManifest(bytes: Buffer | undefined, where: string) {
  if (bytes === undefined) throw new Error(`${where} has no package.json.`);
  return JSON.parse(bytes.toString("utf8")) as Manifest;
}

export function manifestBytes(manifest: Manifest): Buffer {
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
}

/** Every dependency `manifest` lists, with its spec, across its lists. */
export function dependenciesOf(manifest: Manifest): [string, string][] {
  return dependencyFields.flatMap((field) =>
    Object.entries(manifest[field] ?? {}),
  );
}

/** `manifest` with each dependency's spec passed through `edit`. */
export function editDependencies(
  manifest: Manifest,
  edit: (name: string, spec: string) => [name: string, spec: string],
): Manifest {
  const edited: Manifest = { ...manifest };
  for (const field of dependencyFields) {
    const deps = manifest[field];
    if (deps === undefined) continue;
    edited[field] = Object.fromEntries(
      Object.entries(deps)
        .map(([name, spec]) => edit(name, spec))
        .sort(([a], [b]) => (a < b ? -1 : 1)),
    );
  }
  return edited;
}

/** The package an import specifier names: `@scope/name` or `name`. */
export function packageNamed(specifier: string): string | undefined {
  if (/^[./]/.test(specifier) || specifier.includes(":")) return undefined;
  const parts = specifier.split("/");
  const name = specifier.startsWith("@")
    ? parts.slice(0, 2).join("/")
    : parts[0];
  return name === "" ? undefined : name;
}

/** One package of the install's pnpm workspace. */
export interface WorkspacePackage {
  name: string;
  /** Its folder from the install root, such as `packages/ui`. */
  folder: string;
}

/** The install's pnpm settings, its catalog and its workspace packages. */
export interface Workspace {
  /** `pnpm-workspace.yaml`, to edit and write back. */
  settings: Document;
  catalog: Map<string, string>;
  /** robkit's packages the install takes from a checkout or tarballs. */
  overrides: Map<string, string>;
  /** The workspace packages, by name. */
  packages: Map<string, WorkspacePackage>;
}

export async function readWorkspace(root: string): Promise<Workspace> {
  const settings = parseDocument(
    await readFile(join(root, pnpmSettings), "utf8"),
  );
  // Failsafe reads every scalar as a string, so 1.10 stays a version.
  const plain = parseDocument(
    await readFile(join(root, pnpmSettings), "utf8"),
    { schema: "failsafe" },
  ).toJS() as {
    packages?: string[];
    catalog?: Record<string, string>;
    overrides?: Record<string, string>;
  };
  const packages = new Map<string, WorkspacePackage>();
  for (const pattern of plain.packages ?? []) {
    for await (const path of glob(`${pattern}/package.json`, { cwd: root })) {
      const folder = dirname(path).replaceAll("\\", "/");
      if (folder.split("/").includes("node_modules")) continue;
      const { name } = JSON.parse(
        await readFile(join(root, path), "utf8"),
      ) as Manifest;
      if (name !== undefined) packages.set(name, { name, folder });
    }
  }
  return {
    settings,
    catalog: new Map(Object.entries(plain.catalog ?? {})),
    overrides: new Map(Object.entries(plain.overrides ?? {})),
    packages,
  };
}

/** The package name of the app at `apps/<slug>`, which the Dockerfile builds. */
export function appPackageName(slug: string): string {
  return `@internal/${slug}-app`;
}

/** The slug an app's package name gives, if it follows `@internal/<slug>-app`. */
export function slugOfPackage(name: string | undefined): string | undefined {
  return /^@internal\/(.+)-app$/.exec(name ?? "")?.[1];
}
