// llms.txt, the index an agent reads first: what robkit is, then every
// docs page's Markdown copy with its description, by section, in the
// sidebar's order. See https://llmstxt.org.

import { markdownHref } from "./markdown-copies.ts";

export interface LlmsPage {
  /** The page's address, such as `/docs/get-started/quickstart/`. */
  href: string;
  title: string;
  description: string;
}

export interface LlmsInput {
  /** The site's origin, such as `https://robkit.dev`. */
  origin: string;
  description: string;
  sections: { title: string; pages: LlmsPage[] }[];
}

export function llmsText({ origin, description, sections }: LlmsInput): string {
  const lists = sections.map(
    ({ title, pages }) =>
      `## ${title}\n\n${pages
        .map(
          (page) =>
            `- [${page.title}](${origin}${markdownHref(page.href)}): ${page.description}`,
        )
        .join("\n")}\n`,
  );
  return [
    "# robkit\n",
    `> ${description}\n`,
    "Each page below is Markdown. The same page as HTML is at its address without `.md`.\n",
    ...lists,
  ].join("\n");
}
