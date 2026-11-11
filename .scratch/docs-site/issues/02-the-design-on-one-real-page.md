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

**Status:** ready-for-agent

- [ ] `site/DESIGN.md` exists, and a test fails on a hex, `rgb()` or `hsl()` colour in any stylesheet or component outside the tokens file
- [ ] axe finds nothing on the page in light or dark, at 375 and at 1280 pixels wide
- [ ] Text contrast is at least 4.5 to 1 in both themes, and focus is visible on every control
- [ ] The theme follows the system on first paint with no flash, and the toggle's choice survives a reload
- [ ] The toggle and the phone menu work from the keyboard, and the menu closes on Escape
- [ ] With scripts off, the page's text and navigation are there
- [ ] With reduced motion set, nothing animates
- [ ] The page makes no request to another origin
- [ ] The page's Node version is read from the templates, and a test fails if the page and the templates differ
- [ ] A test holds the page's scripts under the recorded size
- [ ] The PR's CI `gate` job passes on GitHub
