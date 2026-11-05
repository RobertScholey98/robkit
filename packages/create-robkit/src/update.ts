import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { readInstallChoices } from "./add.ts";
import { checkInstall, describeProblem } from "./check.ts";
import type { ImportRecord } from "./generate.ts";
import {
  checkContract,
  fetchApp,
  intoInstall,
  writeSettings,
  type VersionDifference,
} from "./import.ts";
import {
  parseManifest,
  readTree,
  readWorkspace,
  type Tree,
  type Workspace,
} from "./sharing.ts";

const run = promisify(execFile);

export interface UpdateOptions {
  /** Replace the app with the new export, dropping the owner's edits. */
  force?: boolean;
}

export interface Updated {
  slug: string;
  /** The app's name, from its manifest. */
  name: string;
  /** The folder or git URL it updated from. */
  from: string;
  /** Whether any of the app's files changed. */
  changed: boolean;
  /**
   * The app's files, from its folder, where the owner's edits and the
   * export's changes meet. Each holds both, marked as git marks a conflict.
   */
  conflicts: string[];
  /** Versions the catalog lacked, now in it. */
  catalogued: [name: string, version: string][];
  differences: VersionDifference[];
}

/** Whether two versions of a file, either perhaps missing, are the same. */
function same(a: Buffer | undefined, b: Buffer | undefined): boolean {
  return a === undefined || b === undefined ? a === b : a.equals(b);
}

/** What each side of a merged file is called in its conflict markers. */
const labels = (slug: string) => [
  `your apps/${slug}`,
  "the last import",
  "the new export",
];

/**
 * Merges one file's three versions with git merge-file. A conflict leaves
 * both sides in, between git's markers. A file git can't merge, such as an
 * image, keeps the owner's version.
 */
async function mergeFile(
  slug: string,
  ours: Buffer,
  base: Buffer,
  theirs: Buffer,
): Promise<{ bytes: Buffer; conflict: boolean }> {
  const temp = await mkdtemp(join(tmpdir(), "robkit-merge-"));
  try {
    const files = ["ours", "base", "theirs"].map((name) => join(temp, name));
    await Promise.all(
      [ours, base, theirs].map((bytes, i) => writeFile(files[i] ?? "", bytes)),
    );
    const args = ["merge-file", "-p"];
    for (const label of labels(slug)) args.push("-L", label);
    try {
      const { stdout } = await run("git", [...args, ...files], {
        encoding: "buffer",
        maxBuffer: 64 * 1024 * 1024,
      });
      return { bytes: stdout, conflict: false };
    } catch (error) {
      const { code, stdout } = error as { code?: unknown; stdout?: Buffer };
      // git merge-file exits with the number of conflicts, or above 127 on
      // a file it can't merge.
      if (typeof code === "number" && code > 0 && code < 128 && stdout) {
        return { bytes: stdout, conflict: true };
      }
      return { bytes: ours, conflict: true };
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

/**
 * The three-way merge of the app: `ours` as the owner has it, `base` as the
 * last import wrote it, and `theirs` as the new export would write it. A
 * file only one side changed takes that side's version, removal included.
 * A file both changed merges line by line.
 */
async function mergeTrees(
  slug: string,
  base: Tree,
  ours: Tree,
  theirs: Tree,
): Promise<{ merged: Tree; conflicts: string[] }> {
  const merged: Tree = new Map();
  const conflicts: string[] = [];
  const paths = new Set([...base.keys(), ...ours.keys(), ...theirs.keys()]);
  for (const path of [...paths].sort()) {
    const [b, o, t] = [base.get(path), ours.get(path), theirs.get(path)];
    let result: Buffer | undefined;
    if (same(o, t) || same(b, t)) result = o;
    else if (same(b, o)) result = t;
    else if (o !== undefined && t !== undefined) {
      const file = await mergeFile(slug, o, b ?? Buffer.alloc(0), t);
      if (file.conflict) conflicts.push(path);
      result = file.bytes;
    } else {
      // One side removed the file and the other changed it: keep the change.
      conflicts.push(path);
      result = o ?? t;
    }
    if (result !== undefined) merged.set(path, result);
  }
  return { merged, conflicts };
}

/** Turns the app's folder from `from` into `to`, touching no other file. */
async function rewriteApp(dir: string, from: Tree, to: Tree): Promise<void> {
  for (const path of from.keys()) {
    if (!to.has(path)) await rm(join(dir, path), { force: true });
  }
  for (const [path, bytes] of to) {
    if (same(from.get(path), bytes)) continue;
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), bytes);
  }
}

/** Why robkit can't merge without the export the app was last imported from. */
function noBase(slug: string, record: ImportRecord, why: string): Error {
  return new Error(
    `apps/${slug} came from ${record.from}, ${why}, so robkit can't tell your edits from the export's changes. Commit the install, then run pnpm robkit update ${slug} --force to replace apps/${slug} with the new export. git diff then shows the edits it dropped.`,
  );
}

/** The app as the last import wrote it, from the commit it recorded. */
async function lastImport(
  root: string,
  slug: string,
  record: ImportRecord,
  workspace: Workspace,
): Promise<Tree> {
  const { commit } = record;
  if (commit === undefined) {
    throw noBase(
      slug,
      record,
      "which wasn't a clean git repository when it was imported",
    );
  }
  const temp = await mkdtemp(join(tmpdir(), "robkit-update-"));
  try {
    const clone = join(temp, "app");
    try {
      await run("git", [
        "clone",
        "--quiet",
        "--config",
        "core.autocrlf=false",
        "--no-checkout",
        record.from,
        clone,
      ]);
      await run("git", ["checkout", "--quiet", commit], { cwd: clone });
    } catch {
      throw noBase(
        slug,
        record,
        `where robkit can't find the commit it imported, ${commit.slice(0, 7)}`,
      );
    }
    const tree = await readTree(clone);
    return (await intoInstall(root, slug, { tree, record }, workspace)).tree;
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

/**
 * `robkit update`: brings `apps/<slug>`, which robkit import brought in, up
 * to the newest export of the folder or git URL it came from. It keeps the
 * owner's own edits, merging them with the export's changes against what
 * the last import wrote, as git merges a branch. Where both changed the
 * same lines, the file holds both, between git's conflict markers. With
 * `force`, the new export replaces the app. It writes files only: the
 * schema and its data stay, and `pnpm dev` runs only new migrations.
 */
export async function updateApp(
  root: string,
  slug: string,
  { force = false }: UpdateOptions = {},
): Promise<Updated> {
  // Refuses a folder that isn't an install.
  await readInstallChoices(root);
  const dir = join(root, "apps", slug);
  if (!existsSync(join(dir, "package.json"))) {
    throw new Error(`apps/${slug} doesn't exist in this install.`);
  }
  const ours = await readTree(dir);
  const record = parseManifest(ours.get("package.json"), `apps/${slug}`).robkit
    ?.imported;
  if (record === undefined) {
    throw new Error(
      `apps/${slug} wasn't imported with robkit import, so there's no export to update it from.`,
    );
  }

  const fetched = await fetchApp(root, record.from);
  const manifest = parseManifest(fetched.tree.get("package.json"), record.from);
  checkContract(manifest, record.from);
  const workspace = await readWorkspace(root);
  const theirs = await intoInstall(root, slug, fetched, workspace);
  const { merged, conflicts } = force
    ? { merged: theirs.tree, conflicts: [] }
    : await mergeTrees(
        slug,
        await lastImport(root, slug, record, workspace),
        ours,
        theirs.tree,
      );

  const changed =
    merged.size !== ours.size ||
    [...merged].some(([path, bytes]) => !same(ours.get(path), bytes));
  if (changed) {
    await rewriteApp(dir, ours, merged);
    const problems =
      conflicts.length > 0
        ? []
        : (await checkInstall(root)).filter((problem) =>
            problem.file.startsWith(`apps/${slug}/`),
          );
    if (problems.length > 0) {
      await rewriteApp(dir, merged, ours);
      throw new Error(
        `The new export of ${slug} breaks the layer rule, so apps/${slug} stays as it was:\n${problems.map(describeProblem).join("\n")}`,
      );
    }
    await writeSettings(
      root,
      workspace,
      theirs.additions,
      theirs.kept.length > 0,
    );
  }
  return {
    slug,
    name: manifest.robkit?.name ?? slug,
    from: record.from,
    changed,
    conflicts,
    catalogued: changed ? [...theirs.additions].sort() : [],
    differences: changed ? theirs.differences : [],
  };
}
