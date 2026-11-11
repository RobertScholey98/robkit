// A file from the templates `npm create robkit` and `robkit add` copy, read
// as the site builds, so a page shows what an install holds rather than a
// pasted copy of it.

import { basename } from "node:path";
import { readRepoFile } from "./repo.ts";

/** Where the templates are, from the repo's root. */
export const templatesRoot = "packages/create-robkit/templates";

/**
 * Where an install keeps a template file. `base/` is the install's root,
 * and `stacks/<stack>/` is an app's folder, `apps/<app>/`. A file npm would
 * drop from the package, stored as `gitignore`, gets its dot back.
 */
export function installPath(path: string, app = "example"): string {
  const inInstall =
    /^base\/(.+)$/.exec(path)?.[1] ??
    /^stacks\/[^/]+\/(.+)$/.exec(path)?.[1]?.replace(/^/, `apps/${app}/`);
  if (inInstall === undefined) {
    throw new Error(
      `${path} isn't under the templates' "base/" or "stacks/<stack>/".`,
    );
  }
  return basename(inInstall) === "gitignore"
    ? `${inInstall.slice(0, -"gitignore".length)}.gitignore`
    : inInstall;
}

const languages = [
  [/\.tsx$/, "tsx"],
  [/\.ts$/, "ts"],
  [/\.js$/, "js"],
  [/(\.go|^go\.mod)$/, "go"],
  [/\.json$/, "json"],
  [/\.ya?ml$/, "yaml"],
  [/\.sql$/, "sql"],
  [/\.md$/, "md"],
  [/^Dockerfile$/, "dockerfile"],
] as const;

/** A language a template file can be shown in. */
export type TemplateLang = (typeof languages)[number][1] | "text";

/** The language Shiki colours a file in, from its name. */
export function langOf(path: string): TemplateLang {
  const name = basename(path);
  return languages.find(([pattern]) => pattern.test(name))?.[1] ?? "text";
}

/** Part of a file: from the line that has `from`, to the next that has `to`. */
export interface Part {
  /** Text only the part's first line has. `^` at its start means the line starts with the rest. */
  from?: string | undefined;
  /** Text the part's last line has. Without it, the part runs to the file's end. */
  to?: string | undefined;
}

const has = (line: string, text: string) =>
  text.startsWith("^") ? line.startsWith(text.slice(1)) : line.includes(text);

/** The indent every line that isn't blank starts with, taken off. */
function dedent(lines: string[]): string[] {
  const indents = lines
    .filter((line) => line.trim() !== "")
    .map((line) => line.length - line.trimStart().length);
  const shared = Math.min(...indents);
  return lines.map((line) => line.slice(shared));
}

/**
 * `part` of a file's text, both its lines kept and its shared indent taken
 * off, or the whole file. Either way, without the last newline. `where`
 * names the page in an error.
 */
export function templatePart(text: string, part: Part, where: string): string {
  const lines = text.replace(/\n$/, "").split("\n");
  const { from, to } = part;
  if (from === undefined) return lines.join("\n");
  const starts = lines.flatMap((line, i) => (has(line, from) ? [i] : []));
  const [start] = starts;
  if (start === undefined) {
    throw new Error(
      `${where}: no line has "${from}". Name a line the part starts on.`,
    );
  }
  if (starts.length > 1) {
    throw new Error(
      `${where}: ${String(starts.length)} lines have "${from}". Name text only the first line of the part has.`,
    );
  }
  const end =
    to === undefined
      ? lines.length - 1
      : lines.findIndex((line, i) => i >= start && has(line, to));
  if (end === -1) {
    throw new Error(`${where}: no line from "${from}" on has "${String(to)}".`);
  }
  return dedent(lines.slice(start, end + 1)).join("\n");
}

/**
 * A template file's text, or `part` of it, as an install gets it: with LF
 * line ends, as create-robkit writes them. `page` names the page in an
 * error, so a wrong path fails the build saying where it is.
 */
export async function templateFile(
  path: string,
  page: string,
  part: Part = {},
): Promise<string> {
  const file = `${templatesRoot}/${path}`;
  let text: string;
  try {
    text = await readRepoFile(file);
  } catch (error) {
    throw new Error(
      `${page} shows ${file}, which doesn't exist. Check the path from ${templatesRoot}.`,
      { cause: error },
    );
  }
  return templatePart(text.replaceAll("\r\n", "\n"), part, page);
}
