// Parts of the repo's own Markdown files, cut and reshaped for a docs page
// as the site builds, so the page follows the file with no edit to the
// site. `built.ts` renders them.

import { dirname, posix } from "node:path";
import { repoUrl } from "./site.ts";

/** A line that is a Markdown heading, and its level. */
const headingLevel = (line: string) => /^(#{1,6}) /.exec(line)?.[1]?.length;

/**
 * The lines under `heading`, a whole heading line such as `### Known gaps`,
 * up to the next heading at its level or above. `source` names the file in
 * the error when it has no such heading.
 */
export function sectionUnder(
  markdown: string,
  heading: string,
  source: string,
): string {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const start = lines.indexOf(heading);
  const level = headingLevel(heading);
  if (start === -1 || level === undefined) {
    throw new Error(`${source} has no heading "${heading}".`);
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => (headingLevel(line) ?? 7) <= level);
  return (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
}

/**
 * The bullet list right after the paragraph that starts with `leadIn`.
 * `source` names the file in the error when it has none.
 */
export function listAfter(
  markdown: string,
  leadIn: string,
  source: string,
): string {
  const blocks = markdown.replaceAll("\r\n", "\n").split(/\n{2,}/);
  const at = blocks.findIndex((block) => block.startsWith(leadIn));
  const list = blocks[at + 1];
  if (at === -1 || list?.startsWith("- ") !== true) {
    throw new Error(
      `${source} has no list after a paragraph that starts "${leadIn}".`,
    );
  }
  return list;
}

/**
 * The first bullet list in `markdown`. `source` names the file and the
 * part in the error when it has none.
 */
export function listIn(markdown: string, source: string): string {
  const list = markdown
    .replaceAll("\r\n", "\n")
    .split(/\n{2,}/)
    .find((block) => block.startsWith("- "));
  if (list === undefined) throw new Error(`${source} has no list.`);
  return list;
}

/**
 * `markdown`, from the repo file `from`, with each relative link made a
 * link to its file on GitHub, so it works on a docs page. A link with a
 * scheme, or one to an anchor on the same page, stays as it is.
 */
export function linksToGitHub(markdown: string, from: string): string {
  return markdown.replaceAll(/\]\(([^)\s]+)\)/g, (link, target: string) => {
    if (/^[a-z]+:/i.test(target) || target.startsWith("#")) return link;
    const path = posix.normalize(posix.join(dirname(from), target));
    return `](${repoUrl}/blob/main/${path})`;
  });
}

/**
 * The anchor a term's heading gets on the built page, as Astro makes it:
 * lower case, with punctuation dropped and each space a hyphen.
 */
export const anchorOf = (term: string) =>
  term
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}\s-]/gu, "")
    .replaceAll(" ", "-");

/** Each term `GLOSSARY.md` defines, as its `**Term**:` lines name them. */
export function glossaryTerms(glossary: string): string[] {
  return [...glossary.matchAll(/^\*\*(.+)\*\*:$/gm)].map(
    ([, term = ""]) => term,
  );
}

/**
 * `GLOSSARY.md`'s "Language" section as a docs page's body: each group a
 * second-level heading, and each term a third-level one over its meaning.
 * A term in bold in another's meaning links to it. The "Avoid" lines are
 * for whoever writes robkit's words, so they go.
 */
export function glossaryMarkdown(glossary: string): string {
  const language = sectionUnder(glossary, "## Language", "GLOSSARY.md");
  const terms = new Set(glossaryTerms(glossary));
  /** The term `bold` names, itself or as a plural. */
  const termOf = (bold: string) =>
    [bold, bold.replace(/s$/, "")].find((name) => terms.has(name));
  return language
    .split("\n")
    .filter((line) => !line.startsWith("_Avoid_:"))
    .map((line) => {
      const term = /^\*\*(.+)\*\*:$/.exec(line)?.[1];
      if (term !== undefined) return `### ${term}\n`;
      if (line.startsWith("### ")) return line.slice(1);
      return line.replaceAll(/\*\*([^*]+)\*\*/g, (bold, name: string) => {
        const target = termOf(name);
        return target === undefined ? bold : `[${name}](#${anchorOf(target)})`;
      });
    })
    .join("\n");
}
