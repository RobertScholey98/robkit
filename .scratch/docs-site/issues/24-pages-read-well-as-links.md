# 24: Every page reads well as a link, to people and to agents

**What to build:** What a page carries for whoever, or whatever, fetches it.

- **For a link preview.** Each page has a title, a description from its front matter, a canonical address and a preview image. One image serves the whole site, designed with `/ui-ux-pro-max`.
- **For a crawler.** A sitemap and a `robots.txt` that names it. The sitemap leaves out the 404, the samples page and stubs.
- **For an agent.** The build writes each docs page as Markdown, at the page's address with `.md` in place of its trailing slash, and an `llms.txt` at the root that lists every page with its description. The Markdown is what a reader sees, not the page's source: a stack switcher becomes each stack's sample under its name, a file shown from the templates becomes that file's text in a fence, a callout and the pre-release line become plain text, and the glossary's and the gaps' built lists are written out. No import, JSX or expression is left in it.
- The link check from ticket 03 reads the Markdown files' links too.

**Blocked by:** 03, 05

**Status:** done

- [x] A page without a description fails the build with a message that names the file
- [x] Each page's HTML has its title, description, canonical address and the preview image
- [x] The sitemap lists every page but the 404, the samples page and stubs, and `robots.txt` names the sitemap
- [x] The Markdown of a page that uses a stack switcher, a template file, a callout and the pre-release line holds each one's text, every stack under its name, and no import or JSX
- [x] `llms.txt` lists every docs page, and a new page appears there with no other edit
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

**What I chose**

- **Markdown from the built page.** Each copy is made from the page's built HTML, not its MDX. So it holds what a reader sees, built parts and template files included, and no component needs a Markdown version of its own.
  - `markdown.ts` reads the page's title, lead and prose, and makes each piece of the site plain:
    - every stack's sample sits under its name in bold
    - a code block becomes a fence, with `title="..."` when its bar names a file
    - a callout, the pre-release line among them, becomes a quote that starts with **Note** or **Warning**
    - a diagram becomes "Diagram:" with its title and description
    - a screenshot becomes an image with its alt text
  - Buttons, icons, live regions, tabs and HTML comments stay out.
  - A link to a heading on the same page points at the HTML page's address, since Markdown headings have no ids.
- **Packages.** The converting uses unified's `hast-util-from-html`, `hast-util-to-mdast`, `mdast-util-to-markdown` and `mdast-util-gfm`, at build time only. The newest releases of two of them came out this month, so the catalog pins releases at least two weeks old.
- **Where things are.** A copy sits at its page's address with `.md` in place of the trailing slash, as the ticket says. Each docs page also links to it with `<link rel="alternate" type="text/markdown">`.
- **`llms.txt`** is an Astro endpoint over the docs collection, in the sidebar's order through `buildNavigation`. It starts with robkit's one-line description, now `siteDescription` in `site.ts`, shared with the home page.
- **`robots.txt`** is an endpoint too. It lets every crawler in and names the sitemap.
- **The sitemap** is written after the build from the built pages. It leaves out any page with `<meta name="robots" content="noindex">`, which the 404 and the samples page have, and any stub. So a new page is in it with no edit, and so is a new page outside `docs/`.
- **Link previews.** BaseLayout gives every page Open Graph and Twitter tags: its title without "| robkit", its description, and one image. A page that asks to be left out has no canonical address. Every other page names its own.
  - **The image.** `public/preview.png`, 1200 by 630 and 38 KB, made by `pnpm preview-image` from `scripts/preview-image.html`.
  - **What it shows.** The terminal mark and name, the home page's headline, and `pnpm robkit add notes` in a terminal. It uses the dark theme's tokens from `tokens.css` and the site's own fonts.
  - DESIGN.md has a new "Link previews" section saying what it shows and when to make it again.
- **Descriptions.** The schema already stopped the build without a description. It now also stops on an empty one, with `.trim().min(1)`.
- **Shared helpers.**
  - `docs-page.ts` reads a built docs page's own parts, for both search and the Markdown copies.
  - `dist.ts` lists the files under `dist` for the three build steps.
- **Coverage.** `vitest.config.ts` leaves `src/pages/**` out of coverage, as it does `content.config.ts`. Astro runs the endpoints, and the built-site tests check what they wrote.

**Proof**

- `markdown.test.ts` (8 tests) turns a page holding every piece into exact Markdown: a stack switch, a command, a template file, a callout, the pre-release line, a diagram, the install tree, a screenshot, a same-page link and comments. `markdown-copies.test.ts`, `sitemap.test.ts` and `llms.test.ts` check each writer on a small built site.
- On the real build:
  - `markdown-copies.test.ts` checks every docs page has a copy starting with its title, and holds no `import`, `export`, JSX tag or brace outside code. Your first app's copy has every stack's name with a titled template fence under it. Upgrading's copy has a callout as a quote. Quickstart's has the pre-release line. Each docs page links to its copy.
  - `sitemap.test.ts` checks the sitemap equals every built page minus the noindex pages and stubs, holds the home page and the quickstart, and leaves out the 404 and the samples page. It also checks `robots.txt` word for word.
  - `llms.test.ts` checks `llms.txt` lists exactly one copy for each docs page in the repo, each with a description. Since it reads the collection, a new page is listed with no other edit.
  - `link-previews.test.ts` checks every built page's title, description, preview image and card tags, and the canonical rule, and reads the PNG's header for its size.
- `links.test.ts` now reads `.md` files, skipping code. On the real build every link and image in the copies leads somewhere.
- `front-matter.test.ts` runs `astro sync` on a page with no description and on one with an empty description. Each stops, naming the file.
- I broke two things and rebuilt. I dropped stack names from the Markdown, and gave noindex pages a canonical link. Two tests failed, one for each, and passed once restored.
- I read the copies of Quickstart and Your first app, and the image, by eye.
- In `site/`, `pnpm build`, `pnpm lint`, `pnpm typecheck` and `pnpm test` pass, with 473 tests and the 2 Go tests skipped on Windows. At the root, `pnpm knip` and `pnpm format:check` pass, and so does the glossary test.

**Found along the way**

- Ticket 23's search index ran on past the page to the site's footer, and took in the copy button's script. I fixed it on ticket 23's branch, in PR #145, before building on it.

**What the next tickets need**

- A new docs page needs nothing for any of this, but its description must say something.
- A new page outside `docs/` is in the sitemap unless it passes `noindex` to BaseLayout. It has no Markdown copy and isn't in `llms.txt`.
- Ticket 27's host has to serve `.md` files as `text/markdown` or `text/plain`, and `llms.txt` and `robots.txt` as text. GitHub Pages does.
- Make the preview image again with `pnpm preview-image` if the home page's headline or the dark theme changes.

**What milestone 4 and ticket 26 change**

- Nothing here. When ticket 26 turns `preRelease` off, the pre-release line goes from the Markdown copies too, and `markdown-copies.test.ts` expects that.
