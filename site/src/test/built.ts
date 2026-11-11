// Readers for the built site in dist/, for the tests that check what a
// page says against the repo.

import { glob, readFile } from "node:fs/promises";
import { join } from "node:path";
import { repoRoot } from "../repo.ts";

/** A built page, by its path under dist/. */
export const built = (path: string): Promise<string> =>
  readFile(join(repoRoot, "site", "dist", path), "utf8");

/** The text of each item in the first list after the heading `id`. */
export function itemsAfter(html: string, id: string): string[] {
  const list = /<ul>[\s\S]*?<\/ul>/.exec(
    html.slice(html.indexOf(`id="${id}"`)),
  );
  return [...(list?.[0] ?? "").matchAll(/<li>([\s\S]*?)<\/li>/g)].map(
    ([, item = ""]) =>
      item
        .replaceAll(/<[^>]+>/g, "")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">"),
  );
}

/** Each code block on a built page: the label above it, and its text. */
export function codeBlocks(html: string) {
  const text = (fragment: string) =>
    fragment
      .replaceAll(/<[^>]+>/g, "")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'")
      .replaceAll(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
        String.fromCodePoint(Number.parseInt(hex, 16)),
      )
      .replaceAll("&amp;", "&");
  return [...html.matchAll(/<figure class="code"[\s\S]*?<\/figure>/g)].map(
    ([figure]) => ({
      label: text(
        /<span class="label"[^>]*>([\s\S]*?)<\/span><\/span>/.exec(
          figure,
        )?.[1] ?? "",
      ),
      code: text(/<pre[^>]*>([\s\S]*?)<\/pre>/.exec(figure)?.[1] ?? ""),
    }),
  );
}

const dist = join(repoRoot, "site", "dist");

/** The origin the site is built for. */
export const origin = "https://robkit.dev";

/** Every built HTML page, by its path under dist/, sorted. */
export async function builtPages(): Promise<string[]> {
  const pages: string[] = [];
  for await (const page of glob("**/*.html", { cwd: dist })) {
    pages.push(page.replaceAll("\\", "/"));
  }
  return pages.sort();
}

/** Whether a built page asks search engines to leave it out. */
export const isNoindex = (html: string) =>
  html.includes('<meta name="robots" content="noindex">');

/** Where a built page is served: `docs/a/index.html` is at `/docs/a/`. */
export const addressOf = (page: string) =>
  `${origin}/${page.replace(/index\.html$/, "")}`;
