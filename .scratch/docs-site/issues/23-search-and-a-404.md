# 23: Search, and a 404 that helps

**What to build:** Search over every docs page, built as a static index when the site builds, with nothing sent to another origin. And a 404 page.

- A search box in the header, opened by a click or by `/`. The key does nothing while the reader is typing in a field. Results show the page, the heading and the matching text, and Enter opens one. An empty box and a search that finds nothing each say so.
- The index covers titles, headings, text, commands and setting names. It leaves out stubs and the samples page.
- **A library is fine** if it runs from the site's own files. Only a small handler for the button and the key loads with the page. The search code and the index load when the reader first opens search.
- The 404 page says the page isn't there, and offers search and the way home. Test it with a path several folders deep, from the local static server. What a host does with a missing path belongs to the hosting work.

Design both with `/ui-ux-pro-max`.

**Blocked by:** 03

**Status:** done

- [x] Searching for a command, a setting's name and a word from a page's text each finds the right page
- [x] Search opens, moves through results and closes from the keyboard, and returns focus to where it was
- [x] `/` typed into a field types a slash
- [x] Until the reader opens search, the page fetches no search code and no index, and stays under the size ticket 02 recorded
- [x] A path that doesn't exist gets the 404 page, with search and a link home
- [x] axe finds nothing on the open search or the 404 page, in either theme
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

**What I chose**

- No library. `site/src/search.ts` is about 200 lines, and a library would weigh more than the dialog's whole script.
  - **Index.** The build writes `search.json` after it writes the pages, from each docs page's prose split at its `##` and `###` headings. A section holds its heading, its address and its text, so commands, setting names and code all count as text.
  - **What it leaves out.** Stubs are left out, and only pages under `docs/` are read, so the samples page and the home page stay out.
  - **How it ranks.** A section must have every word of the search. A word in its heading counts most, then one in its page's title, then one in its text, and the whole search together counts more. It shows 8 results at most, each with the page, the heading and about 200 characters of text with the words marked.
- `@robkit/input` reads `search.json` in the dialog, as the input convention asks for parsed JSON. So the site takes it as a dev dependency, allowed in the package graph in its own commit.
- **What loads when.** Only `search-key.ts` loads with every page, 1.2 KB gzipped. It shows the search buttons and listens for `/`. The dialog's script and the index load the first time search opens.
  - **Search limit.** I recorded a limit of 100 KB gzipped for that first open in DESIGN.md, held by `weight.test.ts`. Today it is 2.1 KB of script and 57 KB of index. The index grows with the docs.
- **The dialog.** It is a `<dialog>`, so focus stays in it and the page behind can't be reached.
  - The arrow keys move between the box and the results, and Enter in the box opens the first result.
  - Escape, the close button and a click outside close it, and give focus back to what had it.
  - The status line is a live region, so a screen reader hears "8 results" or the nothing-found line.
  - The backdrop takes a new `--color-scrim` token, in DESIGN.md's colour table.
- **The header at phone width.** The search button made the header 7 pixels wider than a 375-pixel phone on a docs page. Its gaps and the controls' padding are smaller below 48rem now, and a test holds every header control inside the page.
- **The 404 page.** It says "This page isn't here", and offers the search button, the home page and the docs. Its links and assets start from the root, so it works at any depth. What a host serves for a missing path is ticket 27's.

**Proof**

- `site/src/search.test.ts` covers the index reader, the search and the JSON reader, at 100% coverage. `search-index.test.ts` checks the build hook writes docs pages in order and leaves out a stub and the samples page.
- `site/src/search.browser.test.ts` drives the built site in Chromium:
  - The page fetches neither the dialog's script nor `search.json` until `/` opens search, then both.
  - "robkit add" finds the command page's `robkit add` section, "ROBKIT_DOMAIN" the settings page's section, and "neighbours" the Security page.
  - An empty box and a search for "zzzzqqq" each say so.
  - From the keyboard it opens with `/`, moves down and up through results, closes on Escape with focus back on the link that had it, and opens a result with Enter.
  - The close button gives focus back to the search button at 375 pixels.
  - `a/b` typed into a field stays in the field, and search doesn't open.
  - axe finds nothing on the open dialog at 375 and 1280 pixels, in both themes.
  - `/docs/one/two/three/not-a-page/` answers 404 from the local static server, with the heading, a link home and a working search button. axe finds nothing on it in either theme.
- `weight.test.ts` still holds every page's opening scripts under 10 KB, and holds search's first open under its own limit.
- I looked at screenshots of the open dialog and the 404 at 1280 light and 375 dark. They showed two faults, now fixed with tests. Excerpts ran a sentence into a name that starts with a dot, such as `.gitignore`, and the header overflowed at 375.
- In `site/`, `pnpm build`, `pnpm lint`, `pnpm typecheck` and `pnpm test` pass, with 446 tests and the 2 Go tests skipped on Windows. The repo's glossary and graph-check tests pass.

**What the next tickets need**

- Ticket 24's sitemap should leave out `404.html` as well as the samples page and stubs. `search.json` sits at the root next to it.
- The search box reads only built docs pages, so the Markdown copies ticket 24 writes don't enter the index unless they're under `docs/**/index.html`.
- Ticket 27's host has to serve `404.html` for a missing path. Each host does it differently, and GitHub Pages does it by default.

**What milestone 4 and ticket 26 change**

- Nothing. A new page or section shows up in the index at the next build.
