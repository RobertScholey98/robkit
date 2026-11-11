# 02: The design, on one real page

**What to build:** robkit's own design for the site, made with `/ui-ux-pro-max`, and the docs layout built with it around one real page. One page, finished, is the proof: every later page reuses what this one needed.

- **The style guide first.** Run `/ui-ux-pro-max` for a developer tool's docs and home page, and save what it gives as `site/DESIGN.md`. The skill calls this a design system. `GLOSSARY.md` keeps that phrase for something else, so the site calls it the style guide. It is the one source for colour, type, spacing, radius and motion. Read create-react-app.dev, tanstack.com/start and infinite.red/ignite for what a reader finds in the first minute. Copy no look from them, and borrow no claim about maturity or popularity.
- **Tokens.** The site's CSS holds the guide's values as custom properties, for light and for dark. No component names a raw colour.
- **Themes.** The first paint follows the system setting with no flash. A toggle switches, and remembers the choice in the browser.
- **The docs layout.** A header with the name, the docs link, the GitHub link and the toggle. A sidebar, a column for the page, a list of the page's headings, and a footer. At phone width the sidebar is a menu a button opens.
- **The real page.** "What you need", the first page under Get started. It says what you need to run an install (Node, pnpm, Docker, and WSL on Windows), each with how to check it, and that a React + Go app also needs Go. It says what you should already know: a terminal, git, and one of the five stacks. Until the first release it also says what the checkout route needs. The Node version comes from the `engines` field of the install's `package.json` in the templates, read when the site builds, so it can't drift.
- **Fonts and icons.** Fonts are served from the site. Icons are SVG. No request leaves the site's own origin.
- **Without scripts.** The page reads, and its navigation works, with scripts off.
- **Browser tests.** Playwright opens the built site, in the package's `test` script and not in `test:unit`. It runs axe on the page in light and dark, at 375 and 1280 pixels wide, and drives the toggle and the phone menu from the keyboard.
- **A weight limit.** Record a number for the compressed size of every script a docs page fetches when it opens, shared scripts included, with room for what tickets 05 and 23 add. What search fetches once a reader opens it is measured apart. A test holds the page under the number, and the comments say how it was measured.

**Blocked by:** 01

**Status:** done

- [x] `site/DESIGN.md` exists, and a test fails on a hex, `rgb()` or `hsl()` colour in any stylesheet or component outside the tokens file
- [x] axe finds nothing on the page in light or dark, at 375 and at 1280 pixels wide
- [x] Text contrast is at least 4.5 to 1 in both themes, and focus is visible on every control
- [x] The theme follows the system on first paint with no flash, and the toggle's choice survives a reload
- [x] The toggle and the phone menu work from the keyboard, and the menu closes on Escape
- [x] With scripts off, the page's text and navigation are there
- [x] With reduced motion set, nothing animates
- [x] The page makes no request to another origin
- [x] The page's Node version is read from the templates, and a test fails if the page and the templates differ
- [x] A test holds the page's scripts under the recorded size
- [x] The PR's CI `gate` job passes on GitHub

## Comments

**What I chose.**

- `/ui-ux-pro-max` gave a flat style for a developer tool's docs: JetBrains Mono for headings and code, IBM Plex Sans for body, slate neutrals with an amber accent, and transitions of 120 to 180 ms. `site/DESIGN.md` records every value, with the contrast of each text pair measured in both themes. The lowest is 4.58 to 1 (the accent on code, light). The control edge is 4.55 light and 3.75 dark.
- `src/styles/tokens.css` is the only file that names a colour. `style-guide.test.ts` fails when it and DESIGN.md's tables differ in either direction, and when a hex, `rgb()`, `hsl()` or any other colour function appears in `src/**` outside it.
- The theme: tokens sit on `:root`, the dark set under `prefers-color-scheme: dark` unless `data-theme="light"`, and again under `data-theme="dark"`. An inline script in the head reads `localStorage` key `robkit-theme` before the body. The toggle is a button with `aria-pressed` named "Dark theme".
- Below 64rem the sidebar is a drawer the header's Menu button opens, with `aria-expanded` and `aria-controls`. Escape closes it and gives focus back. Without scripts the sidebar stays in the page above the text, and the toggle and Menu button stay hidden. From 80rem the page's headings show as a column. Below that, they come before the text.
- Fonts are `@fontsource-variable/ibm-plex-sans` and `@fontsource-variable/jetbrains-mono` 5.3.0, served from the site. Icons are inline SVG from Lucide (ISC) and Simple Icons (CC0) in `Icon.astro`.
- The page reads the Node version from the install's `package.json` `engines` and the Go version from the Go stack's `go.mod`, through `src/install.ts`. Turbo lists both files as the site's inputs. The built-site test fails when the page and the templates differ.
- Shiki is off (`markdown.syntaxHighlight: false`). Its default theme showed dark code in the light theme. Code is plain in the tokens' colours until ticket 05 colours it.
- A heading keeps a component out of it. Astro builds the list of headings from the text alone and drops what a component renders, so "Node 24 or later" became "Node or later" in the list. The version goes in the sentence below the heading.
- The weight limit is 10 KB gzipped (`scriptBudget` in `src/site.ts`, stated in DESIGN.md). `weight.test.ts` gzips each script the built page fetches as it opens, alone, as a server sends it: inline scripts, script files and preloaded modules. Today it is about 725 bytes, all inline. What search fetches once a reader opens it is measured apart, in ticket 23.
- From create-react-app.dev, tanstack.com/start and infinite.red/ignite: only create-react-app.dev shows its command on the home page, and that is below the first screen. robkit's home page puts the three commands first. Nothing about their look or their claims is copied.

**How it is checked.**

- `docs-page.browser.test.ts` opens the built site in Chromium through Playwright, over `src/test/serve.ts`, a static server on 127.0.0.1. It runs axe at 375 and 1280 pixels wide in light and dark, drives the toggle and the menu from the keyboard, checks a focus ring on every Tab stop, turns scripts off, sets reduced motion with a case that fails without it, and records every request.
- These run in `test`, not `test:unit`: Vitest has a `unit` project and a `browser` project, and `test:unit` runs `--project unit`.
- I broke each check once to see it fail: low-contrast muted text failed axe, removing the outline failed the focus test, and breaking Escape failed the menu test.
- I looked at the page at 375 and 1280 pixels, light and dark, with the menu open and shut, and at the home page.

**For the next ticket.**

- Astro rewrites `.astro/` on every sync, check and build. The site's `lint` is now `astro sync && eslint .`, since `content.config.ts` imports `astro:content`. Turbo runs the site's `typecheck`, then `build`, then `lint`, so none reads those types while another writes them.
- `content.config.ts` is out of coverage. Astro reads it as it builds, and the built-site tests check the result.
- The docs collection is every `.mdx` under `src/content/docs`. The sidebar lists them all under "Get started" today. Ticket 03 gives the sidebar its sections and order.
- The home page uses `BaseLayout` and is otherwise plain until ticket 06.
- Ticket 05's pre-release line isn't on the page yet. "Before the first release" says the same in prose, and links the README's quickstart.

**What milestone 4 will change on this page.**

- If R answers yes on ticket 21 (`pnpm dev` on native Windows), "Linux or macOS, or WSL on Windows" no longer holds, and the page drops the WSL steps.
- "Before the first release" goes once robkit is on npm, in ticket 26.

### Merged

Added by the lead. PR 101 merged into `docs-site` on 2026-11-11, with `gate` green on `561803d`.
