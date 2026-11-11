// llms.txt, the index an agent reads first: what robkit is, then every
// docs page's Markdown copy with its description, by section, in the
// sidebar's order. See https://llmstxt.org.

import { markdownHref } from "./markdown-copies.ts";
import { buildNavigation, type PageInfo } from "./navigation.ts";

/** A docs page as the docs collection holds it. */
export interface LlmsPage {
  id: string;
  data: Omit<PageInfo, "id"> & { description: string };
}

/**
 * llms.txt for the site at `site`, from what robkit is and the docs
 * pages, which it puts in the sidebar's order.
 */
export function llmsText(
  site: URL | undefined,
  description: string,
  pages: readonly LlmsPage[],
): string {
  const descriptions = new Map(
    pages.map(({ id, data }) => [id, data.description]),
  );
  const { sections } = buildNavigation(
    pages.map(({ id, data }) => ({ id, ...data })),
  );
  const lists = sections.map(
    ({ title, pages: inSection }) =>
      `## ${title}\n\n${inSection
        .map(
          (page) =>
            `- [${page.title}](${String(new URL(markdownHref(page.href), site))}): ${String(descriptions.get(page.id))}`,
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
