// A reader returns its value or an InputProblem, and isProblem is the one
// check for which (docs/conventions/input.md). A `typeof x !== "string"`
// on a reader's result happens to work for a string reader, so lint can't
// tell it from any other typeof. This check finds it by name instead.

import { glob, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { ScannedFile } from "./glossary.ts";

/**
 * The names in `text` that hold a reader's result and are guarded with
 * `typeof name !== "string"`, where `isProblem(name)` belongs.
 */
export function typeofReadChecks(text: string): string[] {
  const names = [...text.matchAll(/\bconst (\w+) = read[A-Z]\w*\(/g)].map(
    ([, name]) => name ?? "",
  );
  return names.filter((name) =>
    new RegExp(`typeof ${name} !== "string"`).test(text),
  );
}

/** robkit's source, the templates and the docs, with their paths from `root`. */
export async function readCodeAndDocs(root: string): Promise<ScannedFile[]> {
  const files: ScannedFile[] = [];
  for await (const entry of glob(
    [
      "packages/*/src/**/*.{ts,tsx}",
      "packages/create-robkit/templates/**/*.{ts,tsx}",
      "packages/*/README.md",
      "docs/**/*.md",
    ],
    {
      cwd: root,
      withFileTypes: true,
      exclude: (dirent) => ["node_modules", "dist"].includes(dirent.name),
    },
  )) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files.push({
      file: relative(root, path).replaceAll("\\", "/"),
      text: await readFile(path, "utf8"),
    });
  }
  return files.sort((a, b) => a.file.localeCompare(b.file));
}
