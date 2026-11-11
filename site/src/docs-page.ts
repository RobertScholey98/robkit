// A built docs page's own parts, as HTML: its title, its lead and its
// prose, without the site's header, sidebar, footer and the rest of the
// frame. Search and the Markdown copies read pages through it.

export interface DocsPage {
  title: string;
  lead: string;
  /** Everything between the page's head and its own footer. */
  prose: string;
}

/** The parts of a built docs page, or undefined for any other page. */
export function docsPageOf(html: string): DocsPage | undefined {
  const prose =
    /<div class="prose"[^>]*>([\s\S]*)<\/div>\s*<footer class="page-foot"/.exec(
      html,
    )?.[1];
  const title = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1];
  const lead = /<p class="lead"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1];
  if (prose === undefined || title === undefined || lead === undefined) {
    return undefined;
  }
  return { title, lead, prose };
}
