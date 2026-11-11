// The docs pages as files: what each one's front matter says, read
// straight from its MDX, without Astro. The tests and the script that
// lists the pages to read again use it. Astro's schema in content.config.ts
// stays the one that stops a build.

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
  /** Repo files the page describes, from the repo root. A folder ends in `/`. */
  describes: string[];
  /** The repo file the page is built from, when it isn't its own MDX file. */
  source: string | undefined;
}

const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

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
  const describes = fields.get("describes") ?? [];
  const source = fields.get("source");
  if (typeof title !== "string") throw new Error(`${file} has no title.`);
  if (typeof stub !== "boolean") {
    throw new Error(
      `${file}'s stub is ${JSON.stringify(stub)}, not true or false.`,
    );
  }
  if (!isStrings(describes)) {
    throw new Error(`${file}'s describes isn't a list of paths.`);
  }
  if (source !== undefined && typeof source !== "string") {
    throw new Error(`${file}'s source isn't a path.`);
  }
  const id = posix.relative(docsFolder, file).replace(/\.mdx$/, "");
  return { file, id, title, stub, describes, source };
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

/** The repo file a reader edits to change a page. */
export const pageSource = (page: PageFile) => page.source ?? page.file;

const normal = (path: string) =>
  path.replaceAll("\\", "/").replace(/^\.\//, "");

const names = (described: string, changed: string) =>
  described.endsWith("/")
    ? changed.startsWith(described)
    : changed === described;

export interface PageToReread {
  page: PageFile;
  /** The changed files the page describes. */
  changed: string[];
}

/** The pages whose front matter names one of the `changed` repo files. */
export function pagesDescribing(
  pages: PageFile[],
  changed: string[],
): PageToReread[] {
  const files = changed.map(normal).filter((file) => file !== "");
  return pages.flatMap((page) => {
    const named = files.filter((file) =>
      page.describes.some((described) => names(normal(described), file)),
    );
    return named.length === 0 ? [] : [{ page, changed: named }];
  });
}
