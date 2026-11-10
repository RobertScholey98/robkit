import { existsSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CommandProblem, isMissing } from "@robkit/dev/cli";
import type { Files } from "./generate.ts";

/** Why init can't write into `dir`, unless it's empty or doesn't exist yet. */
export function folderInUse(dir: string): string | undefined {
  try {
    if (readdirSync(dir).length === 0) return undefined;
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
  return `${dir} isn't empty. Choose a new folder.`;
}

/** Writes each of `files` under `dir`, making its parents. */
async function writeFiles(dir: string, files: Files): Promise<void> {
  for (const [path, text] of files) {
    const file = join(dir, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
  }
}

/** Writes `files` into `dir`, which must be empty or not exist yet. */
export async function writeInstall(dir: string, files: Files): Promise<void> {
  const problem = folderInUse(dir);
  if (problem) throw new CommandProblem(problem);
  await writeFiles(dir, files);
}

/**
 * Where `robkit add` builds an app's folder before it moves it into
 * `apps/`. The install's `.gitignore` names it.
 */
export const stagingDir = ".robkit";

/**
 * Writes an app's `files` into `apps/<slug>` in the install at `root`, in
 * one move. The runner and pnpm both read every folder in `apps/`, so a
 * half-written one would break each: it builds the folder in
 * {@link stagingDir} and renames it into place once every file is written.
 * A failure leaves nothing under `apps/`, and removes what it built.
 */
export async function writeApp(
  root: string,
  slug: string,
  files: Files,
): Promise<void> {
  const target = join(root, "apps", slug);
  // A rename would replace an empty folder on Linux and fail on Windows.
  if (existsSync(target)) {
    throw new CommandProblem(
      `apps/${slug} already exists. Choose another name.`,
    );
  }
  await mkdir(join(root, stagingDir), { recursive: true });
  const built = await mkdtemp(join(root, stagingDir, `${slug}-`));
  try {
    await writeFiles(built, files);
    await mkdir(dirname(target), { recursive: true });
    await rename(built, target);
  } finally {
    await rm(built, { recursive: true, force: true });
  }
}
