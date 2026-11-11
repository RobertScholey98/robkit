// The docs search: the index the build writes from each built docs page,
// and the search the page runs over it once a reader opens search. It reads
// HTML with patterns, not a DOM, so the build and the browser share it.

import { type InputProblem, isRecord, problem } from "@robkit/input";
import { docsPageOf } from "./docs-page.ts";

/** One part of a page: its heading, its address and its text. */
export interface Section {
  /** The `##` or `###` heading, or undefined for the text before the first. */
  heading: string | undefined;
  href: string;
  text: string;
}

/** What the build writes to `search.json`: each docs page, in order. */
export interface SearchIndex {
  pages: { title: string; sections: Section[] }[];
}

/** A result: where it is, and a piece of its text with the words marked. */
export interface Found {
  title: string;
  heading: string | undefined;
  href: string;
  excerpt: Excerpt;
}

export interface Excerpt {
  text: string;
  /** The start and end of each word found in `text`. */
  marks: [number, number][];
}

const named = { amp: "&", lt: "<", gt: ">", quot: '"' };

/** What a reader sees of an HTML fragment: its text, on one line. */
function textOf(html: string): string {
  return html
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replaceAll(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replaceAll(
      /&(amp|lt|gt|quot);/g,
      (_, name: keyof typeof named) => named[name],
    )
    .replaceAll(/[‘’]/g, "'")
    .replaceAll(/\s+/g, " ")
    .replaceAll(/\s([.,;:!?)])(?=\s|$)/g, "$1")
    .trim();
}

/**
 * A built docs page's title and sections, from the prose under its `h1`.
 * Undefined for a page with no docs prose, or a stub.
 */
export function sectionsOf(
  html: string,
  href: string,
): { title: string; sections: Section[] } | undefined {
  const page = docsPageOf(html);
  if (page === undefined) return undefined;
  // Without what a reader doesn't see as text: scripts, styles, and the
  // words on buttons.
  const prose = page.prose.replaceAll(
    /<(script|style|button)\b[\s\S]*?<\/\1>/g,
    "",
  );
  if (prose.includes("data-stub")) return undefined;
  const parts = prose.split(/(?=<h[23] id=")/);
  const sections = parts.flatMap((part): Section[] => {
    const heading = /^<h[23] id="([^"]+)"[^>]*>([\s\S]*?)<\/h[23]>/.exec(part);
    const text = textOf(heading ? part.slice(heading[0].length) : part);
    if (heading === null) {
      return text === "" ? [] : [{ heading: undefined, href, text }];
    }
    return [
      {
        heading: textOf(String(heading[2])),
        href: `${href}#${String(heading[1])}`,
        text,
      },
    ];
  });
  return { title: textOf(page.title), sections };
}

/**
 * Reads `search.json`, parsed, into the index the build wrote, or says
 * what's wrong with it.
 */
export function readSearchIndex(value: unknown): SearchIndex | InputProblem {
  const wrong = (what: string) =>
    problem(`search.json${what}. Build the site again to write it.`);
  if (!isRecord(value) || !Array.isArray(value.pages)) {
    return wrong(" isn't an object with a pages list");
  }
  const pages: SearchIndex["pages"] = [];
  for (const [at, page] of value.pages.entries()) {
    const which = `'s page ${String(at + 1)}`;
    if (!isRecord(page) || typeof page.title !== "string") {
      return wrong(`${which} has no title`);
    }
    if (!Array.isArray(page.sections)) {
      return wrong(`${which} has no sections list`);
    }
    const sections: Section[] = [];
    for (const [place, section] of page.sections.entries()) {
      if (
        !isRecord(section) ||
        typeof section.href !== "string" ||
        typeof section.text !== "string" ||
        !(section.heading === undefined || typeof section.heading === "string")
      ) {
        return wrong(
          `${which}, section ${String(place + 1)}, needs an href and text, and a heading only as text`,
        );
      }
      sections.push({
        heading: section.heading,
        href: section.href,
        text: section.text,
      });
    }
    pages.push({ title: page.title, sections });
  }
  return { pages };
}

/** The words of a search, lower-cased. */
const wordsOf = (query: string) =>
  query.toLowerCase().split(/\s+/).filter(Boolean);

const excerptLength = 200;

/**
 * About `excerptLength` characters of `text` around the first place it has
 * a word, cut at spaces, with each word inside marked.
 */
function excerptOf(text: string, words: string[]): Excerpt {
  const lower = text.toLowerCase();
  const first = Math.min(
    ...words.map((word) => lower.indexOf(word)).filter((at) => at >= 0),
  );
  // From the start of the word 60 characters before the first match.
  const start =
    lower.lastIndexOf(" ", Number.isFinite(first) ? first - 60 : 0) + 1;
  let end = Math.min(text.length, start + excerptLength);
  if (end < text.length) end = lower.lastIndexOf(" ", end);
  const before = start > 0 ? "…" : "";
  const piece = `${before}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
  const pieceLower = piece.toLowerCase();
  const marks: [number, number][] = [];
  for (const word of words) {
    for (
      let at = pieceLower.indexOf(word);
      at >= 0;
      at = pieceLower.indexOf(word, at + word.length)
    ) {
      marks.push([at, at + word.length]);
    }
  }
  return { text: piece, marks: marks.toSorted(([a], [b]) => a - b) };
}

/**
 * The sections that have every word of `query`, in their page's title,
 * their heading or their text, best first: a match in a heading or title
 * counts most, and the whole query together counts more.
 */
export function find(index: SearchIndex, query: string, limit = 8): Found[] {
  const words = wordsOf(query);
  if (words.length === 0) return [];
  const phrase = words.join(" ");
  const sections = index.pages.flatMap(({ title, sections }) =>
    sections.map((section) => ({ section, title })),
  );
  const scored = sections.flatMap(({ section, title }, order) => {
    const heading = section.heading?.toLowerCase() ?? "";
    const text = section.text.toLowerCase();
    const named = `${title.toLowerCase()} ${heading}`;
    if (!words.every((word) => named.includes(word) || text.includes(word))) {
      return [];
    }
    let score = 0;
    for (const word of words) {
      if (heading.includes(word)) score += 8;
      if (title.toLowerCase().includes(word)) score += 4;
      if (text.includes(word)) score += 1;
    }
    if (heading.includes(phrase)) score += 16;
    else if (text.includes(phrase)) score += 4;
    return [{ section, title, score, order }];
  });
  return scored
    .toSorted((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map(({ section, title }) => ({
      title,
      heading: section.heading,
      href: section.href,
      excerpt: excerptOf(section.text, words),
    }));
}
