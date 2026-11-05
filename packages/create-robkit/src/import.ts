import { execFile } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { isDeepStrictEqual, promisify } from "node:util";
import { slugProblem } from "@robkit/dev";
import { isPlatformApp } from "@robkit/session/addresses";
import { format } from "prettier";
import { readInstallChoices } from "./add.ts";
import { checkInstall, describeProblem } from "./check.ts";
import { runsContracts } from "./contract.ts";
import { sharedFolder, writtenByExport } from "./export.ts";
import { pnpmSettings, type ImportRecord } from "./generate.ts";
import {
  appPackageName,
  dependenciesOf,
  editDependencies,
  manifestBytes,
  parseManifest,
  readTree,
  readWorkspace,
  slugOfPackage,
  subtree,
  writeTree,
  type Manifest,
  type Tree,
  type Workspace,
} from "./sharing.ts";

const run = promisify(execFile);

export interface ImportOptions {
  /** The slug to import the app as, instead of the one its manifest gives. */
  as?: string;
}

/** A version an app asked for that the install's catalog sets otherwise. */
export interface VersionDifference {
  name: string;
  asked: string;
  catalog: string;
}

export interface Imported {
  slug: string;
  /** The app's name, from its manifest. */
  name: string;
  /** Its `shared/` packages that are the install's own, so it uses those. */
  mapped: string[];
  /** Its `shared/` packages that differ, kept in the app: old name to new. */
  kept: [from: string, to: string][];
  /** Versions the catalog lacked, now in it. */
  catalogued: [name: string, version: string][];
  differences: VersionDifference[];
}

/** Where installs keep the shared packages an imported app keeps. */
const keptPackages = `apps/*/${sharedFolder}/*`;

/** Files an app's repo holds for itself, never part of the app. */
function isRepoFile(path: string, bytes: Buffer): boolean {
  if (path === pnpmSettings || path === "pnpm-lock.yaml") return true;
  if (path.startsWith("vendor/robkit/")) return true;
  if (path.includes("/")) return false;
  const firstLine = bytes.subarray(0, 200).toString("utf8").split("\n")[0];
  return firstLine?.includes(writtenByExport) ?? false;
}

function isGitUrl(source: string): boolean {
  return (
    /^[a-z][a-z0-9+.-]*:\/\//i.test(source) ||
    /^[\w.-]+@[\w.-]+:/.test(source) ||
    source.endsWith(".git")
  );
}

async function git(dir: string, ...args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd: dir });
  return stdout.trim();
}

/**
 * The commit `dir` is at, if it's the top of a git repository with nothing
 * uncommitted, so that commit holds exactly what an import reads.
 */
async function cleanCommit(dir: string): Promise<string | undefined> {
  try {
    const top = await git(dir, "rev-parse", "--show-toplevel");
    if (realpathSync(top) !== realpathSync(dir)) return undefined;
    if ((await git(dir, "status", "--porcelain")) !== "") return undefined;
    return await git(dir, "rev-parse", "HEAD");
  } catch {
    return undefined;
  }
}

/** An app's repo as fetched: its files, its folder's name and its origin. */
export interface Fetched {
  tree: Tree;
  folder: string;
  record: ImportRecord;
}

/**
 * The app's files from a folder, or from a fresh clone of a git URL, and
 * where they came from.
 */
export async function fetchApp(root: string, source: string): Promise<Fetched> {
  const local = resolve(root, source);
  if (existsSync(local) && statSync(local).isDirectory()) {
    const commit = await cleanCommit(local);
    return {
      tree: await readTree(local),
      folder: basename(local),
      record: { from: local, ...(commit !== undefined && { commit }) },
    };
  }
  if (!isGitUrl(source)) {
    throw new Error(`There's no folder at ${source}, and it isn't a git URL.`);
  }
  const temp = await mkdtemp(join(tmpdir(), "robkit-import-"));
  try {
    const clone = join(temp, "app");
    await run("git", ["clone", "--quiet", "--depth", "1", source, clone]);
    return {
      tree: await readTree(clone),
      folder: basename(source.replace(/\/+$/, "")).replace(/\.git$/, ""),
      record: { from: source, commit: await git(clone, "rev-parse", "HEAD") },
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

/** "a, b and c". */
function andList(items: readonly (string | number)[]): string {
  const strings = items.map(String);
  const last = strings.at(-1) ?? "";
  return strings.length > 1
    ? `${strings.slice(0, -1).join(", ")} and ${last}`
    : last;
}

/** Refuses an app made for a contract version this install can't run. */
function checkContract(manifest: Manifest, source: string): void {
  const contract = manifest.robkit?.contract;
  if (contract === undefined) {
    throw new Error(
      `${source} names no robkit contract version, so it isn't an app robkit export wrote. Its package.json needs a robkit field with "contract".`,
    );
  }
  if (!runsContracts.includes(contract)) {
    const runs = andList(runsContracts);
    throw new Error(
      `${manifest.robkit?.name ?? source} was made for robkit contract ${String(contract)}, but this install runs contract ${runs}. Import an export of it made for contract ${runs}, or import it into an install whose robkit runs contract ${String(contract)}.`,
    );
  }
}

/** Why the app can't be `apps/<slug>` in the install at `root`, if it can't. */
function slugRefusal(
  root: string,
  slug: string,
  given: boolean,
): string | undefined {
  const rename = "Import it under another name with --as <name>.";
  const problem = slugProblem(slug);
  if (problem) return given ? problem : `${problem} ${rename}`;
  if (isPlatformApp(slug)) {
    return `${slug} is one of the platform apps every install has: core, hub and admin. ${rename}`;
  }
  if (existsSync(join(root, "apps", slug))) {
    return `apps/${slug} already exists. To update it to this export, remove apps/${slug} and import again: its schema and data stay, the next pnpm dev runs only the migrations it hasn't run yet, and its seed doesn't run again. Commit the install first, so git diff shows what the update changed. To add it as another app instead, use --as <name>.`;
  }
  return undefined;
}

/**
 * A shared package's manifest as the install would hold it: each version
 * the catalog has back to `catalog:`.
 */
function catalogued(manifest: Manifest, workspace: Workspace): Manifest {
  return editDependencies(manifest, (name, spec) =>
    workspace.catalog.has(name) && isVersion(spec)
      ? [name, "catalog:"]
      : [name, spec],
  );
}

/** Whether `spec` is a registry version or range, not a protocol. */
function isVersion(spec: string): boolean {
  return !/^[a-z+]+:/i.test(spec) && !spec.startsWith(".");
}

/** Whether a shared package holds the same files as the install's own. */
async function sameAsInstall(
  root: string,
  pkg: Tree,
  folder: string,
  workspace: Workspace,
): Promise<boolean> {
  const own = await readTree(join(root, folder));
  if (!isDeepStrictEqual([...own.keys()], [...pkg.keys()])) return false;
  for (const [path, bytes] of pkg) {
    const theirs = own.get(path);
    if (theirs === undefined) return false;
    if (path === "package.json") {
      const shared = catalogued(parseManifest(bytes, folder), workspace);
      if (!isDeepStrictEqual(shared, parseManifest(theirs, folder))) {
        return false;
      }
    } else if (!bytes.equals(theirs)) {
      return false;
    }
  }
  return true;
}

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Files whose quoted module names an import rewrites when it renames. */
const rewritten = /\.(?:[cm]?[jt]sx?|css|json|html)$/;

/**
 * `text` with every quoted name of a renamed package, or of a path in it,
 * pointing at its new name.
 */
function renamed(text: string, renames: Map<string, string>): string {
  let result = text;
  for (const [from, to] of renames) {
    result = result.replace(
      new RegExp(`(["'\`])${escaped(from)}(/[^"'\`\\s]*)?\\1`, "g"),
      (_, quote: string, path: string | undefined) =>
        `${quote}${to}${path ?? ""}${quote}`,
    );
  }
  return result;
}

/**
 * The app's files and manifests as the install holds them: shared packages
 * the install has mapped onto its own, the rest kept and renamed, every
 * version back in the catalog, and in its manifest where it came from.
 */
export async function intoInstall(
  root: string,
  slug: string,
  { tree: repo, record }: Pick<Fetched, "tree" | "record">,
  workspace: Workspace,
): Promise<{
  tree: Tree;
  mapped: string[];
  kept: [string, string][];
  additions: Map<string, string>;
  differences: VersionDifference[];
}> {
  const tree: Tree = new Map(
    [...repo].filter(([path, bytes]) => !isRepoFile(path, bytes)),
  );

  // The shared packages, by name, and whether the install's own matches.
  const shared = new Map<string, { folder: string; manifest: Manifest }>();
  const same = new Set<string>();
  for (const path of tree.keys()) {
    const match = new RegExp(`^${sharedFolder}/([^/]+)/package\\.json$`).exec(
      path,
    );
    if (!match?.[1]) continue;
    const folder = `${sharedFolder}/${match[1]}`;
    const pkg = subtree(tree, folder);
    const manifest = parseManifest(pkg.get("package.json"), folder);
    if (manifest.name === undefined) continue;
    shared.set(manifest.name, { folder, manifest });
    const own = workspace.packages.get(manifest.name);
    if (
      own !== undefined &&
      !own.folder.startsWith("apps/") &&
      (await sameAsInstall(root, pkg, own.folder, workspace))
    ) {
      same.add(manifest.name);
    }
  }
  // A package maps onto the install's only if everything it uses does too.
  for (let changed = true; changed;) {
    changed = false;
    for (const name of same) {
      const uses = dependenciesOf(shared.get(name)?.manifest ?? {});
      if (uses.some(([dep]) => shared.has(dep) && !same.has(dep))) {
        same.delete(name);
        changed = true;
      }
    }
  }
  const renames = new Map<string, string>();
  for (const [name, { folder }] of shared) {
    if (same.has(name)) {
      for (const path of subtree(tree, folder).keys()) {
        tree.delete(`${folder}/${path}`);
      }
    } else {
      renames.set(name, `@internal/${slug}-${basename(folder)}`);
    }
  }
  for (const [from, to] of renames) if (from === to) renames.delete(from);

  // Versions back into the catalog, with the ones it lacks added.
  const additions = new Map<string, string>();
  const differences: VersionDifference[] = [];
  const intoCatalog = (manifest: Manifest): Manifest =>
    editDependencies(manifest, (name, spec) => {
      const to = renames.get(name);
      if (to !== undefined) return [to, "workspace:*"];
      if (!isVersion(spec)) return [name, spec];
      const version = workspace.catalog.get(name);
      if (version === undefined) {
        if (!additions.has(name)) additions.set(name, spec);
      } else if (version !== spec) {
        differences.push({ name, asked: spec, catalog: version });
      }
      return [name, "catalog:"];
    });

  for (const [path, bytes] of tree) {
    if (basename(path) === "package.json") {
      const manifest = parseManifest(bytes, path);
      const ownName =
        manifest.name === undefined ? undefined : renames.get(manifest.name);
      const edited = intoCatalog({
        ...manifest,
        ...(ownName !== undefined && { name: ownName }),
      });
      if (path === "package.json") {
        edited.name = appPackageName(slug);
        delete edited.packageManager;
        edited.robkit = { ...edited.robkit, imported: record };
      }
      tree.set(path, manifestBytes(edited));
    } else if (renames.size > 0 && rewritten.test(path)) {
      const text = bytes.toString("utf8");
      const next = renamed(text, renames);
      if (next !== text) {
        const pretty = await format(next, { filepath: path }).catch(() => next);
        tree.set(path, Buffer.from(pretty));
      }
    }
  }
  return {
    tree,
    mapped: [...same].sort(),
    kept: [...renames].sort(([a], [b]) => (a < b ? -1 : 1)),
    additions,
    differences,
  };
}

/** Adds the catalog's new versions and, if needed, kept packages' folders. */
async function writeSettings(
  root: string,
  workspace: Workspace,
  additions: Map<string, string>,
  keepsPackages: boolean,
): Promise<void> {
  const { settings } = workspace;
  if (additions.size === 0 && !keepsPackages) return;
  for (const [name, version] of [...additions].sort()) {
    settings.setIn(["catalog", name], version);
  }
  const packages = (settings.toJS() as { packages?: string[] }).packages ?? [];
  if (keepsPackages && !packages.includes(keptPackages)) {
    settings.addIn(["packages"], keptPackages);
  }
  await writeFile(
    join(root, pnpmSettings),
    await format(settings.toString(), { filepath: pnpmSettings }),
  );
}

/**
 * `robkit import`: brings an app's repo, from a folder or a git URL, into
 * the install at `root` as `apps/<slug>`. It refuses an app made for a
 * contract version the install can't run, a slug that's taken or a platform
 * app's, and an app that breaks the layer rule. Each `shared/` package the
 * install has byte for byte maps back onto the install's own; any other
 * stays in the app, renamed after it. Versions go back into the catalog. It
 * writes files only: `pnpm install` takes in the app's dependencies, and
 * `pnpm dev` gives it its schema, migrations and seed.
 */
export async function importApp(
  root: string,
  source: string,
  { as }: ImportOptions = {},
): Promise<Imported> {
  // Refuses a folder that isn't an install.
  await readInstallChoices(root);
  const fetched = await fetchApp(root, source);
  const manifest = parseManifest(fetched.tree.get("package.json"), source);
  checkContract(manifest, source);
  const slug = as ?? slugOfPackage(manifest.name) ?? fetched.folder;
  const refusal = slugRefusal(root, slug, as !== undefined);
  if (refusal) throw new Error(refusal);

  const workspace = await readWorkspace(root);
  const { tree, mapped, kept, additions, differences } = await intoInstall(
    root,
    slug,
    fetched,
    workspace,
  );
  const dir = join(root, "apps", slug);
  await writeTree(dir, tree);
  const problems = (await checkInstall(root)).filter((problem) =>
    problem.file.startsWith(`apps/${slug}/`),
  );
  if (problems.length > 0) {
    await rm(dir, { recursive: true, force: true });
    throw new Error(
      `${manifest.robkit?.name ?? slug} breaks the layer rule, so it wasn't imported:\n${problems.map(describeProblem).join("\n")}`,
    );
  }
  await writeSettings(root, workspace, additions, kept.length > 0);
  return {
    slug,
    name: manifest.robkit?.name ?? slug,
    mapped,
    kept,
    catalogued: [...additions].sort(),
    differences,
  };
}
