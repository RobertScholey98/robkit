// Where the robkit repo is, so a page can read a file from it as the site
// builds. Astro bundles each page before it runs it, so a page can't find
// the repo from its own address.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** The nearest folder from `start` up that holds `pnpm-workspace.yaml`. */
export function findRepoRoot(start: string): string {
  for (let folder = start; ; folder = dirname(folder)) {
    if (existsSync(join(folder, "pnpm-workspace.yaml"))) return folder;
    if (dirname(folder) === folder) {
      throw new Error(
        `No folder from ${start} up holds pnpm-workspace.yaml. Build the site from inside the robkit repo.`,
      );
    }
  }
}

/** The robkit repo's root. pnpm runs the site's scripts from `site/`. */
export const repoRoot = findRepoRoot(process.cwd());

/**
 * A text file from the repo, by its path from the root, such as
 * `README.md`. Write the path out in full: a test checks each one is among
 * the turbo inputs of the site's build and tests in turbo.json.
 */
export function readRepoFile(path: string): Promise<string> {
  return readFile(join(repoRoot, path), "utf8");
}
