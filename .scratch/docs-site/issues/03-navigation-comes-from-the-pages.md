# 03: The navigation comes from the pages

**What to build:** A page says where it belongs in its own front matter, and the sidebar, the order and the links between pages follow from that. Nobody edits a list of pages by hand.

- **One function builds the navigation.** It takes the pages' front matter (section, title, order) and returns the sidebar's sections, each page's place, and its next and previous pages. It is plain data in and out, with unit tests. Two pages with the same order sort by title.
- **The sidebar** shows the PRD's sections in its order, and marks the page the reader is on.
- **On this page.** The list of a page's headings comes from the page, links to each, and marks the heading in view.
- **Next and previous** links at the foot of each page.
- **Edit this page.** Each page links to its source file on GitHub. A page built from another file, as the glossary will be, links to that file. The links lead nowhere until `docs-site` merges to `main`, which is expected.
- **Stubs.** A page not written yet is a stub: its front matter says so, it shows one true paragraph and "This page isn't written yet", and a test counts the stubs. This ticket adds a stub for the quickstart, "Your first app" and each of the five stack guides, so later pages have something to link to. Ticket 26 fails if one is left.
- **What a page describes.** A page's front matter can name the repo files it describes. A script takes a list of changed files and prints the pages that name them, so whoever changes robkit can see which pages to read again. It fails nothing.
- **Links are checked.** A test over the built site fails on an internal link, an anchor or a local image that leads nowhere. It runs in `test:unit`.

**Blocked by:** 02

**Status:** done

- [x] The function's unit tests cover the order within a section, the order of sections, two pages with the same order, a page with no order, and the first and last page's missing neighbour
- [x] A page with no section or title fails the build with a message that names the file
- [x] The sidebar marks the current page, and a screen reader hears which one it is
- [x] The list of headings links to real headings, marks the one in view as the page scrolls, and works as plain links with scripts off
- [x] Each page has next and previous links that match the sidebar's order
- [x] Each page's edit link points at its file on GitHub
- [x] A link to a page, an anchor or a local image that doesn't exist fails a test that names the page and the link
- [x] A test reports how many stubs the site has, and each stub says it isn't written yet
- [x] Given a changed file, the script prints the pages whose front matter names it
- [x] The PR's CI `gate` job passes on GitHub

## Comments

**What I chose.**

- A page's front matter has `title`, `description`, `section` and, optionally, `order`, `stub`, `describes` and `source`. `section` is one of the PRD's six: Get started, Build an app, Run an install, Deploy, Concepts, Reference. `content.config.ts` takes the list from `navigation.ts`, so the schema and the sidebar can't differ.
- `buildNavigation()` in `src/navigation.ts` is plain data in and out. It returns the sections that have pages, in the PRD's order, and each page's section, previous and next, by id. Pages sort by `order`, then title. A page with no `order` comes after those with one. Previous and next run across sections, in reading order.
- A page with no title or section, or with a section not in the list, stops the build in Astro's own schema check, and Astro's message names the file. `front-matter.test.ts` proves it by running `astro sync` on a copy of the config and one page under `site/.fixtures/`, which git and ESLint ignore. Each case takes about 3 seconds.
- The sidebar groups each section's links under its name, with the list labelled by it, and marks the current page with `aria-current="page"`, which a screen reader reads as "current page". The page head shows its section above the title.
- "On this page" is the h2 and h3 headings Astro finds in the page. `src/scripts/toc.ts` sets `aria-current="true"` on the link to the last heading that has passed the header, and on the last heading at the foot of the page. Anchor links scroll smoothly, except with reduced motion. Without scripts the list is plain links.
- The foot of each page has "Edit this page on GitHub", then Previous and Next as two cards. The edit link goes to `https://github.com/RobertScholey98/robkit/edit/main/<path>`. `<path>` is `site/<the page's MDX>`, or `source` for a page built from another file (the glossary, in ticket 19).
- A stub has `stub: true`. It shows "This page isn't written yet." in a note above its one paragraph. This ticket adds seven: `get-started/quickstart` (order 2), `get-started/your-first-app` (order 4, leaving 3 for "What you got"), and `build-an-app/` `tanstack-start`, `react-hono`, `react-express`, `nextjs` and `react-go` (orders 1 to 5, in the PRD's order). Each paragraph comes from the README and `create-robkit/src/choices.ts`.
- `pages.test.ts` names its stub count in the test's title ("the site's 7 stubs"). It checks each stub shows the note and no other page does. Ticket 26 turns it into a failure.
- `describes` lists repo paths from the root, and a path ending in `/` covers a folder. `pnpm --filter @internal/site pages-to-reread <paths>`, or `git diff --name-only origin/main | pnpm --filter @internal/site pages-to-reread`, prints each page that names a changed file. It always exits 0. CONTRIBUTING says how to run it.
- `links.test.ts` checks the built site in `test:unit`. Every `href` and `src` that isn't another origin, `mailto:` or `data:` must lead to a built file, and its anchor to an `id` on that page. A failure lists `{ page, link }`. I added a link to `/docs/nope/` and one to a missing anchor on a stub. The test failed and named both, then I took them out.
- `/ui-ux-pro-max` asked for the current section to be marked and for smooth scrolling to anchors. It had no entry for previous and next links. They follow its general rules: a 44px or larger target, the label and the page's title, and a hover state.

**For the next tickets.**

- A new page needs `section` and, usually, `order`. Leave gaps in `order` where a page will come later.
- A page built from another file sets `source` to that file's repo path. Its edit link and the edit-link test follow it.
- Ticket 04's checks can read the pages through `readPages()` in `src/pages.ts`, which reads the front matter without Astro.
- Tickets 23 and 24 can leave stubs out with `stub` from the collection, or with `data-stub` on the built note.
- Once, on Windows, the three `astro sync` runs in `front-matter.test.ts` all stopped answering, and the test timed out. It didn't happen again in about ten runs. Each sync is now stopped after 45 seconds, and the failure says so and shows what Astro printed by then.

**What milestone 4 will change on these pages.**

- Ticket 34 (`robkit add` finds `pnpm dev` from any terminal) may change what "Your first app" says about running `pnpm robkit add`.
- Ticket 27 (the templates finished) changes the stacks' templates that the five guide stubs name in `describes`.

### Merged

Added by the lead. PR 103 merged into `docs-site` on 2026-11-11, with `gate` green on `570a8a1`.
