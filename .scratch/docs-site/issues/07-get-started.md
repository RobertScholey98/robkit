# 07: Get started

**What to build:** The pages that take an owner from nothing to a signed-in hub and a first app of their own. Ticket 02 wrote "What you need".

- **Quickstart.** Making an install, what init asks (the folder when none is given, and the example app's stack), what it prints, `pnpm dev`, and claiming the install in the hub. It ends with the owner signed in. It says what each refusal means: Node too old, no pnpm, Docker not answering, a port taken.
- **Two routes, one switch.** Until the first release the quickstart leads with the route that works today, an install made from a checkout of the repo, and shows `npm create robkit` as what it will be. The pre-release switch from ticket 05 turns that round: `npm create robkit` first, and the checkout route gone.
- **What you got.** The install's folders, from "Where things are" in the install's README: what each is for, in a short tree.
- **Your first app.** `pnpm robkit add` while `pnpm dev` runs, what it asks, the app's address, and the app in the launcher. Then one change to the app that the reader sees in the browser.
- **Where next.** Sharing the app with a guest, the guide for the reader's stack, and "Run an install".

Each page follows "The words" in the [PRD](../PRD.md). Read each message from the code that prints it. Describe a message without quoting it, unless a test fails when the code's text changes.

**Blocked by:** 03, 05

**Status:** done

- [x] Following the quickstart's checkout route in WSL ends at a signed-in hub, and the PR's Proof says how that was run
- [x] Following "Your first app" adds an app to a running `pnpm dev`, opens it from the launcher, and shows the page's one change in the browser. The Proof names the stack and the steps
- [x] Each refusal the pages name is one the code prints, with the fix the code gives
- [x] The folder tree matches what `npm create robkit` writes, and a test fails when a folder it names is gone from the templates
- [x] With the pre-release switch off, the quickstart shows `npm create robkit` first and no checkout route
- [x] The quickstart and "Your first app" are no longer stubs
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

**What I chose.**

- The quickstart runs: make an install (what it asks, what it does, when it stops), start it (when `pnpm dev` stops at the start), claim the install, what you got, and next.
- Until the first release, "Make an install" shows the route from a clone first, then `npm create robkit` as what it will be. `<BeforeRelease>` and `<AfterRelease>` hold each route's words, and `preRelease` in `site.ts` picks one. The headings stay the same either way, so the page's contents list stays right.
- The clone route's fence is marked `sh checkout`. Ticket 04's command check now holds a `checkout` fence to robkit's own `package.json`, since `pnpm create-install` is robkit's script, not an install's.
- The pre-release line now links to the quickstart's "Make an install", not the README.
- "What you got" is `<InstallTree />`, from `install-tree.ts`. Its entries come from "Where things are" in the install's README, plus `docs/deploy.md`, `AGENTS.md` and `README.md`.
- "Your first app" walks through `pnpm robkit add`'s four questions, opening the app from the launcher, and one change: the owner's heading. The change is a `<StackSwitch>` of each stack's `case "owner":` lines, read from its template and named for an app called `notes`.
- "Where next" links to two new stub pages, `run-an-install/pnpm-dev-and-your-apps` and `run-an-install/guests-and-access`, and to each stack's guide through `<StackGuides />`. Tickets 16 and 17 write those pages. They can rename them if the links move too.
- The refusals are described, not quoted, so no test is tied to their wording.

**Proof.**

- In WSL Ubuntu 22.04 with Node 24, a script followed the pages:
  - `git clone --branch docs-site` of the repo from GitHub, `corepack enable` (pnpm 11.28.9), `pnpm install`, then `pnpm create-install ../my-install --stack react-hono`. It printed the next steps and the hub's address.
  - `pnpm dev`, until the hub answered.
  - In Chromium, it opened http://hub.robkit.localhost:3000, filled in Set up this install, and selected Create owner. The hub said "Signed in as robin" and listed the example app.
  - `pnpm robkit add notes --stack react-hono --access owner` printed "Added apps/notes. pnpm dev started notes at http://notes.robkit.localhost:3000."
  - The launcher showed "📦 notes" without a reload. Opening it showed "Signed in as the owner".
  - The script changed the heading's words in `apps/notes/src/routes.tsx`. After a reload, the page said "Hello from my first app".
  - The screenshots are in the scratchpad, not the repo.
- Each refusal, and where its message and fix are:
  - Node too old: `packages/create-robkit/src/create-robkit-command.ts`, before anything loads.
  - pnpm missing or the wrong version, and the `corepack enable` or `npm install -g pnpm` fix: `requirePnpm` and `pnpmFix` in `packages/create-robkit/src/toolchain.ts`. `init` runs it before it writes, as `init.ts` says.
  - The folder isn't empty: `packages/create-robkit/src/write.ts`.
  - Docker missing at init is a note, not a refusal: `dockerNote` in `toolchain.ts`.
  - Docker not installed, Docker not answering with Docker's own line, and the proxy's, an app's and Postgres's port taken: `packages/dev/src/checks.ts`, in `checkBeforeStart`.
  - `robkit add` when `pnpm dev` refuses the app, and when it isn't running: `afterAdd` in `packages/create-robkit/src/dev-answers.ts`.
- `install-tree.test.ts` finds each entry of the tree in the templates, and the example app in each stack's. With `core-client/` renamed `client/`, it failed.
- `built-site.test.ts`:
  - The quickstart's Terminal blocks are the clone route, then `npm create robkit my-install`, then `cd my-install` and `pnpm dev`.
  - I set `preRelease` to false and built. The page had no `git clone`, `create-install` or "Until robkit is on npm", and its Terminal blocks were `npm create robkit my-install` first. The same tests passed, and the pre-release line test passed too. Then I set it back.
  - Neither page is a stub.
  - "Your first app" shows each stack's file under `apps/notes/...`, and links to each stack's guide.
- `get-started.browser.test.ts`: axe finds nothing on either page at 375 and 1280 px, light and dark.
- `site-fences.test.ts` checks a `checkout` fence against robkit's `package.json`, and passes the quickstart.
- In WSL with Go, `turbo run test:unit` for the site and repo-checks passed: 107 and 317 tests, the glossary and site fence checks among them. A first run had 11 time-outs at about 128 s, with no assertion failing, while another checkout's gate held the load at 112. On Windows, the site's lint, typecheck, all 157 tests with 100% coverage, `pnpm knip` and Prettier pass.
- I looked at both pages at 1280 px light and 375 px dark.

**For the next tickets.**

- Ticket 08 can add screenshots of the hub's set-up form and launcher to "Claim the install", and of the app to "Open it from the launcher".
- Ticket 16 writes `run-an-install/pnpm-dev-and-your-apps`, and ticket 17 writes `run-an-install/guests-and-access`. Both are stubs now, and "Your first app" links to them.
- Wrap words a page says only before or after the first release in `<BeforeRelease>` or `<AfterRelease>`. Keep headings outside them, so the contents list is right either way.
- Mark a fence of commands run in robkit's clone `sh checkout`.
- `codeBlocks()` in `built-site.test.ts` gives each block's label and text, for tests on a built page's code.
- In WSL, curl doesn't resolve `*.localhost`. Chromium does. A script that waits for `pnpm dev` needs `curl --resolve`.

**What milestone 4 will change on these pages.**

- Ticket 34 of "Just use it" changes how `robkit add` finds a running `pnpm dev` from another terminal. "Your first app" says only that `robkit add` asks the running `pnpm dev` to start the app, so check that sentence then.
- Ticket 26 turns `preRelease` off. The quickstart then leads with `npm create robkit` and drops the clone route.
- A change to the templates' `case "owner":` lines, or to the hub's set-up form, changes these pages. A lost `case "owner":` line fails the build.
