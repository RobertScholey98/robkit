// Reading the built site in `dist` once Astro has built it, for the steps
// that write more files from the built pages.

import { glob } from "node:fs/promises";

/** The files under `dist` that `pattern` matches, with `/` separators, sorted. */
export async function filesIn(
  dist: string,
  pattern: string,
): Promise<string[]> {
  const files: string[] = [];
  for await (const file of glob(pattern, { cwd: dist })) {
    files.push(file.replaceAll("\\", "/"));
  }
  return files.sort();
}
