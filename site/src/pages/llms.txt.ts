// llms.txt at the site's root, from the docs pages' front matter, in the
// sidebar's order. It links to each page's Markdown copy, which
// markdown-copies.ts writes after the build.

import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { llmsText } from "../llms.ts";
import { buildNavigation } from "../navigation.ts";
import { siteDescription } from "../site.ts";

export const GET: APIRoute = async ({ site }) => {
  const docs = await getCollection("docs");
  const descriptions = new Map(
    docs.map(({ id, data }) => [id, data.description]),
  );
  const { sections } = buildNavigation(
    docs.map(({ id, data }) => ({
      id,
      title: data.title,
      section: data.section,
      order: data.order,
    })),
  );
  const text = llmsText({
    origin: String(site).replace(/\/$/, ""),
    description: siteDescription,
    sections: sections.map(({ title, pages }) => ({
      title,
      pages: pages.map((page) => ({
        ...page,
        description: String(descriptions.get(page.id)),
      })),
    })),
  });
  return new Response(text, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
