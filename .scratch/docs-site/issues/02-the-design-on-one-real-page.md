# 02: The design, on one real page

**What to build:** robkit's own design for the site, made with `/ui-ux-pro-max`, and the docs layout built with it around one real page. One page, finished, is the proof: every later page reuses what this one needed.

- **The design system first.** Run `/ui-ux-pro-max` for a design system for a developer tool's docs and home page, and save it in the site's folder. It is the one source for colour, type, spacing, radius and motion. Read create-react-app.dev, tanstack.com/start and infinite.red/ignite for what a reader finds in the first minute. Copy no look from them.
- **Tokens.** The site's CSS holds the system as custom properties, for light and for dark. No component names a raw colour or size.
- **Themes.** The first paint follows the system setting with no flash. A toggle switches, and remembers the choice in the browser.
- **The docs layout.** A header with the name, the docs link, the GitHub link and the toggle. A sidebar, a column for the page, a list of the page's headings, and a footer. At phone width the sidebar is a menu a button opens.
- **The real page.** "What you need", the first page under Get started: Node 24, pnpm, Docker, and WSL on Windows, each with how to check it. Written to the PRD's rules.
- **Fonts and icons.** Fonts are served from the site. Icons are SVG. No request leaves the site's own origin.
- **Without scripts.** The page reads, and its navigation works, with scripts off.
- **Browser tests.** Playwright opens the built site, in the package's `test` script and not in `test:unit`. It runs axe on the page in light and dark, at 375 and 1280 pixels wide, and drives the toggle and the phone menu from the keyboard.
- **A weight limit.** A test fails when the page's scripts pass a size this ticket sets from its own build, and the ticket's comments record the number.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] The design system is in the site's folder, and the site's CSS takes every colour, size and duration from its tokens
- [ ] axe finds nothing on the page in light or dark, at 375 and at 1280 pixels wide
- [ ] Text contrast is at least 4.5 to 1 in both themes, and focus is visible on every control
- [ ] The theme follows the system on first paint with no flash, and the toggle's choice survives a reload
- [ ] The toggle and the phone menu work from the keyboard, and the menu closes on Escape
- [ ] With scripts off, the page's text and navigation are there
- [ ] With reduced motion set, nothing animates
- [ ] The page makes no request to another origin
- [ ] A test holds the page's scripts under the recorded size
- [ ] The PR's CI `gate` job passes on GitHub
