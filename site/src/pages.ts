// The docs pages as files: what each one's front matter says, read
// straight from its MDX, without Astro, for the tests. Astro's schema in
// content.config.ts stays the one that stops a build.

import { glob, readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import { parse } from "yaml";
import { repoRoot } from "./repo.ts";

/** Where the docs pages live, from the repo root. */
export const docsFolder = "site/src/content/docs";

export interface PageFile {
  /** The page's MDX file, from the repo root. */
  file: string;
  /** Its id in the docs collection, which is also its address under /docs/. */
  id: string;
  title: string;
  stub: boolean;
}

/** A page's front matter, from the text of its MDX `file`. */
export function readPage(text: string, file: string): PageFile {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (match === null) throw new Error(`${file} has no front matter.`);
  const data: unknown = parse(String(match[1]));
  if (typeof data !== "object" || data === null) {
    throw new Error(`${file}'s front matter isn't a set of fields.`);
  }
  const fields = new Map<string, unknown>(Object.entries(data));
  const title = fields.get("title");
  const stub = fields.get("stub") ?? false;
  if (typeof title !== "string") throw new Error(`${file} has no title.`);
  if (typeof stub !== "boolean") {
    throw new Error(
      `${file}'s stub is ${JSON.stringify(stub)}, not true or false.`,
    );
  }
  const id = posix.relative(docsFolder, file).replace(/\.mdx$/, "");
  return { file, id, title, stub };
}

/** Every docs page, by file, in path order. */
export async function readPages(): Promise<PageFile[]> {
  const files: string[] = [];
  for await (const path of glob("**/*.mdx", {
    cwd: join(repoRoot, docsFolder),
  })) {
    files.push(`${docsFolder}/${path.replaceAll("\\", "/")}`);
  }
  files.sort();
  return Promise.all(
    files.map(async (file) =>
      readPage(await readFile(join(repoRoot, file), "utf8"), file),
    ),
  );
}
