import { readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isMissing } from "./files.ts";
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

/** Writes `files` into `dir`, which must be empty or not exist yet. */
export async function writeInstall(dir: string, files: Files): Promise<void> {
  const problem = folderInUse(dir);
  if (problem) throw new Error(problem);
  for (const [path, text] of files) {
    const file = join(dir, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
  }
}
