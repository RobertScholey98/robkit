// Every link inside the built site leads somewhere: each page, anchor and
// local image a page points at exists.

import { glob, readFile, stat } from "node:fs/promises";
import { join, posix } from "node:path";

export interface BrokenLink {
  /** The page with the link, by its path in the built site. */
  page: string;
  /** The link as the page wrote it. */
  link: string;
}

const attribute = /\s(?:href|src)="([^"]*)"/g;
const idAttribute = /\sid="([^"]*)"/g;

const unescape = (value: string) =>
  value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

/** Whether a link leaves the site: another origin, mail, data and the like. */
const isExternal = (link: string) => /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(link);

/** The file a path in the site serves, or undefined when there is none. */
async function servedFile(root: string, path: string) {
  const candidates = path.endsWith("/")
    ? [`${path}index.html`]
    : [path, `${path}/index.html`, `${path}.html`];
  for (const candidate of candidates) {
    const file = join(root, candidate);
    const found = await stat(file).catch(() => {
      // Nothing there: this candidate isn't the file, so try the next.
      return undefined;
    });
    if (found?.isFile() === true) return candidate;
  }
  return undefined;
}

/** Every internal link in the site built at `root` that leads nowhere. */
export async function brokenLinks(root: string): Promise<BrokenLink[]> {
  const pages: { page: string; html: string }[] = [];
  for await (const path of glob("**/*.html", { cwd: root })) {
    const page = path.replaceAll("\\", "/");
    pages.push({ page, html: await readFile(join(root, page), "utf8") });
  }
  pages.sort((a, b) => a.page.localeCompare(b.page, "en"));
  const ids = new Map(
    pages.map(({ page, html }) => [
      page,
      new Set(
        [...html.matchAll(idAttribute)].map((id) => unescape(String(id[1]))),
      ),
    ]),
  );

  const broken: BrokenLink[] = [];
  for (const { page, html } of pages) {
    for (const found of html.matchAll(attribute)) {
      const written = String(found[1]);
      const link = unescape(written);
      if (link === "" || isExternal(link)) continue;
      const hashAt = link.includes("#") ? link.indexOf("#") : link.length;
      const path = link.slice(0, hashAt).replace(/\?.*$/, "");
      const anchor = decodeURIComponent(link.slice(hashAt + 1));
      const target =
        path === ""
          ? page
          : await servedFile(
              root,
              decodeURI(
                path.startsWith("/")
                  ? path.slice(1)
                  : posix.join(posix.dirname(page), path),
              ),
            );
      const leads =
        target !== undefined &&
        (anchor === "" || ids.get(target)?.has(anchor) === true);
      if (!leads) broken.push({ page, link: written });
    }
  }
  return broken;
}
