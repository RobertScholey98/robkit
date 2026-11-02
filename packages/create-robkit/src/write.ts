import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Files } from "./generate.ts";

/** Writes `files` into `dir`, which must be empty or not exist yet. */
export async function writeInstall(dir: string, files: Files): Promise<void> {
  const existing = await readdir(dir).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  });
  if (existing.length > 0) {
    throw new Error(`${dir} isn't empty. Choose a new folder.`);
  }
  for (const [path, text] of files) {
    const file = join(dir, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
  }
}
