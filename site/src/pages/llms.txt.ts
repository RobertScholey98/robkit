// llms.txt at the site's root: see llms.ts. It links to each page's
// Markdown copy, which markdown-copies.ts writes after the build.

import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { llmsText } from "../llms.ts";
import { siteDescription } from "../site.ts";

export const GET: APIRoute = async ({ site }) =>
  new Response(llmsText(site, siteDescription, await getCollection("docs")), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
