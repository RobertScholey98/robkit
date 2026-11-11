// robots.txt: every crawler may read the site, and the sitemap is here.
import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) =>
  new Response(
    `User-agent: *\nAllow: /\n\nSitemap: ${String(new URL("/sitemap.xml", site))}\n`,
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
