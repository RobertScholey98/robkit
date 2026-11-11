# 06: The home page

**What to build:** The page at robkit.dev's root. A newcomer should know in ten seconds what robkit is, and in a minute whether to try it.

- **One sentence** that says what robkit is, in the glossary's words. The README says "for your friends and family" and `CLAUDE.md` says "shared with the community". The sentence is a proposal, and ticket 28 is where R chooses it.
- **The three commands** that make an install and start it, with a copy button and the pre-release line. Until the first release the line links to the quickstart's checkout route, which works today.
- **What robkit gives you, and what stays yours.** One small example of what an app's author writes, a route that reads the viewer, beside what robkit has already done for that app: sign-in, a database schema and a subdomain. Shown from a template file, not a file tree.
- **What an install holds.** The hub where people sign in and launch apps, admin, core, one Postgres, and each app on its own subdomain. A diagram drawn as SVG, in both themes. Ticket 08 adds screenshots.
- **The five stacks**, from `readyStacks`, each linking to its guide.
- **Who it suits, and who it doesn't.** Draw it from the README and the map's destination: someone who wants several small apps behind one sign-in, on a domain and a server of their own. Say plainly that it isn't a hosted service. A proposal, for ticket 28.
- **What it needs.** To try it: Node, pnpm, Docker, and WSL on Windows. To host it: a server running Coolify, a domain, and TLS in front, which is the one path robkit supports today.
- **Ways in.** The quickstart is the one main button. The docs and GitHub are beside it, smaller.
- **Small print.** The licence, and where to report a problem: the repo's issues on GitHub. Promise no support beyond what the repo offers.

Design it with `/ui-ux-pro-max` from `site/DESIGN.md`. Each page follows "The words" in the [PRD](../PRD.md).

**Blocked by:** 03, 05

**Status:** done

- [x] The page says what robkit is in one sentence, above the fold at 375 and at 1280 pixels wide
- [x] The three commands are the README quickstart's, and a test fails if they differ
- [x] The stacks on the page are `readyStacks`, and a test fails if they differ
- [x] The example of an app's code is shown from a template file
- [x] The page says who robkit suits, what trying it needs, what hosting it needs, and where to report a problem
- [x] Every claim about what an install or an app holds matches what `npm create robkit` and `robkit add` write, and the PR's Proof says where each was checked
- [x] axe finds nothing in light or dark, at 375 and at 1280 pixels wide
- [x] With scripts off, everything on the page but the copy buttons works
- [x] The page stays under the script size ticket 02 recorded
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

**What I chose.**

- The sentence is the README's first line: "A kit for self-hosting small apps for your friends and family." It's the h1. Ticket 28 is where R picks it.
- The page runs: the sentence and a lead, one quickstart button with Docs and GitHub beside it as plain links, the three commands with the pre-release line, what robkit does beside the example app's `.get("/")` handler from `stacks/react-hono/src/routes.tsx`, the diagram beside a list of what an install holds, the five stacks, who it suits, what it needs, and a closing quickstart panel. The footer already had the licence and the issues link.
- "Who it suits" is a proposal for ticket 28. It says robkit isn't hosted for you, and isn't made for an app strangers sign up to.
- The diagram follows the README's mermaid one: the proxy sends each subdomain to hub, admin, core and your apps, those three call core over HTTP, and core and your apps keep their data in Postgres. It's inline SVG coloured by the tokens, so it follows the theme, with a title and description for a screen reader.
- `guideHref(stack)` in `stacks.ts` gives each stack's guide address. The guides are the pages ticket 03 made, and a test fails if one is missing.
- `SwitcherStack.value` is now a `Stack`, so a page can hand it to `guideHref`.
- The browser tests now get 120 s each and 180 s for a hook, since CI is several times slower.

**Proof.**

- `home.browser.test.ts`, in Chromium at 375 and 1280 px:
  - The h1 and the quickstart button end above 800 px.
  - axe finds nothing in light or dark.
  - With scripts off, the h1, the commands and every link in `main` show, and there is no copy button.
- `built-site.test.ts`:
  - The block labelled Terminal is the README quickstart's three commands. With the page showing two of them, it failed.
  - The stack links are TanStack Start, React + Hono, React + Express, Next.js and React + Go, in `readyStacks`' order, at each `guideHref`. With the first stack left off, it failed.
  - The block labelled `apps/example/src/routes.tsx` is the template's `.get("/")` handler, read from the file in the test.
  - The page has the headings Who it suits, To try it and To host it, and links to the repo's issues. With "Who it suits" renamed, it failed.
- `weight.test.ts` now measures the home page: 1,367 bytes gzipped, against 10 KB.
- Where each claim was checked:
  - Sign-in, a launcher, an admin page and one Postgres: `README.md` line 3.
  - The guard checks each request before a handler runs, and the viewer is the owner, a guest with roles or nobody: `templates/stacks/react-hono/AGENTS.md` lines 7 and 16.
  - Core mints each app's token: the same file, line 16.
  - An app's own schema, and a role that reaches nothing else: `templates/base/AGENTS.md` lines 57 and 70.
  - Migrations run each time the app starts: `templates/base/AGENTS.md` lines 75 and 79.
  - `<slug>.<domain>`, under `pnpm dev` and on Coolify: `templates/base/AGENTS.md` line 57 and `templates/base/docs/deploy.md` line 9.
  - The owner picks who may open an app in admin: `templates/base/AGENTS.md` line 62, and `README.md` line 35.
  - What the hub, admin and core hold: `templates/base/AGENTS.md` line 3.
  - The diagram's arrows: the mermaid diagram in `README.md`, lines 53 to 62.
  - Coolify, `*.<domain>`, a Cloudflare tunnel terminating TLS, and a GitHub App on the repository: `templates/base/docs/deploy.md` lines 1, 40 and 68.
  - Node's version comes from `<InstallVersion tool="node">`, which reads the templates.
- In WSL, `turbo run test:unit` for the site and repo-checks passed: 97 and 316 tests. On Windows, the site's lint and typecheck, `pnpm knip` and Prettier pass, and all the site's tests pass with 100% coverage.
- I looked at the page at 375 and 1280 px in light and dark.

**For the next tickets.**

- Link to a stack's guide with `guideHref(stack)`. Tickets 11 to 15 write those pages at the addresses it gives.
- Ticket 07's quickstart is the page the home page's main button opens: `/docs/get-started/quickstart/`.
- Ticket 08 can put screenshots of the hub and admin on the home page, beside the diagram.
- `codeBlocks()` in `built-site.test.ts` now decodes `&#x..;` entities, which Shiki writes for `<`.

**What milestone 4 will change on this page.**

- A change to the README's quickstart changes the home page's commands at the next build.
- A change to the react-hono `.get("/")` handler changes the example. If the handler loses that line, the build fails.
- If robkit deploys to a second host, "What it needs" and "Coolify is the one host robkit deploys to today" need rewriting.
- Ticket 26 turns `preRelease` off, which takes the line off the home page.
