# 25: Deploy

**What to build:** The deploy guide for the one path robkit supports: Coolify on the owner's server, as the install's `docs/deploy.md` describes it.

It waits for ticket 22 of "Just use it", which changes what `robkit deploy` deploys and prints, and writes the TLS requirement into `docs/deploy.md`. Today that file doesn't state it. Build this once milestone 4 has merged to `main` and `main` has been merged into `docs-site`.

- What to set up once, in order, and what each step is for.
- **Claim it at once.** Whoever opens a new install first becomes its owner. The guide says to claim the hosted install straight after the first deploy, and to check the setup page is gone.
- `pnpm robkit deploy`, its dry run with the reason it gives for each app, and what it prints.
- **Three kinds of value.** What the deploy command itself reads (`COOLIFY_URL`, `COOLIFY_TOKEN` and the rest), the shared variables on the host, and each app's own settings.
- What needs TLS in front, and what breaks without it.
- What the guide doesn't cover: other hosts, backups, observability and secret rotation. It says so plainly.

**Blocked by:** 03, 05; ticket 22 of "Just use it", merged into this branch

**Status:** done

- [x] Every step and command on the page is in the install's `docs/deploy.md` or in the code as ticket 22 left them, and the PR's Proof names the commit read
- [x] Every name `robkit deploy` reads is on the page, and every name on the page is one it reads or sets
- [x] The page says to claim the install at once, and how to check it is claimed
- [x] The page says what it doesn't cover
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### What I chose

- **One page, `/docs/deploy/coolify/`**, titled "Deploy to Coolify", in the Deploy section. Its order is TLS, the one-time setup, claiming the install, the deploy itself (which apps deploy, the dry run, what it prints), the three kinds of value, what it sets on each app, the Cloudflare tunnel, adding and removing an app, and what it doesn't cover.
- **TLS comes first**, before the setup, since nothing works without it.
- **Claiming comes straight after the setup.** It says how to check in two ways. In a private window, the hub shows **Sign in** where it showed **Set up this install**. Or `curl https://core.<domain>/session` answers `{"state":"signed-out"}` once the install has an owner, and `{"state":"unclaimed"}` until then. Both come from the hub's `forms.tsx` and core's `session-store.ts`.
- **No made-up output.** A deploy's real table needs Coolify, so the page lists the dry run's reasons and the lines that need the owner, and doesn't show a sample table.
- **Step 9 says "an Access client ID and secret"**, not "service token". The glossary allows "service token" only in `docs/deploy.md` and `coolify-api.ts`.
- **The settings page** now links to "An app's own settings" on the guide, in place of naming the install's `docs/deploy.md`.
- **A fix outside the page.** The link check and the Markdown copies' test only knew code fences at the start of a line. This page is the first with fences inside a numbered step, so they read the braces in `coolify.json` as page text. Both now take an indented fence. The link check's case failed first.

### Proof

- **Read at `8943fb3f`.** That is the last commit on this branch to touch `docs/deploy.md`, `packages/create-robkit/src`, the hub's `src` or core's `src`. The branch's `packages/` is the same as `origin/docs-site`'s. Every step, command and value on the page is in `docs/deploy.md` there or in that code.
- **`deploy.test.ts`** holds the page to the code:
  - **Names.** It writes the page's own `coolify.json` into a fresh install and runs `robkit deploy --dry-run` with no `COOLIFY_URL`, which prints every variable it sets on each app. It runs `robkit deploy` and `robkit database-urls` with a variable missing, so each names what it reads. The names in inline code on the page must equal those, with each app's `CORE_DATABASE_URL` and the like written as `<SLUG>_DATABASE_URL`. That run also proves the page's `coolify.json` is one `robkit deploy` accepts.
  - **Reasons.** The dry run's reasons on the page equal the ones in `coolify-deploy.ts`.
  - **Setup.** Each command and the `coolify.json` in the setup are in `docs/deploy.md`.
  - **Claiming.** "Claim it at once" is the heading straight after the setup, says to claim as soon as the first deploy finishes, and gives the hub's two headings and core's two states as the code has them.
  - **Not covered.** That section lists other hosts, backups, observability and secret rotation.
- **I broke the built page on purpose**, in five ways: renaming a variable, dropping a reason, rewording the claim, renaming an item in what it doesn't cover, and changing the `openssl` command. Each failed its test, then passed once restored.
- **`deploy.browser.test.ts`**: axe finds nothing at 375 and 1280 pixels in either theme, and the page doesn't scroll sideways at 375.
- **In `site/`**, `pnpm build`, `pnpm lint`, `pnpm typecheck` and `pnpm test` pass, with 484 tests at 100% coverage. At the root, `pnpm knip`, `pnpm format:check`, the glossary test and `check-coverage-thresholds.ts origin/docs-site` pass. `site-fences.test.ts` passes but for its two Go tests, which need `gofmt`, and this machine has no Go. The page has no Go.

### What the next tickets need

- `deploy.test.ts` runs `robkit-command.ts` as a child process, as the reference tests do. A new variable in `deploymentOf`, `readCoolify` or `readDatabaseUrlsConfig` fails it until the page names it.
- The reasons test reads `reason:` strings out of `coolify-deploy.ts`. If that code builds a reason another way, the test needs to follow it.

### What milestone 4 / ticket 26 changes

- Nothing known. Milestone 4's deploy changes, ticket 22 of "Just use it" included, were already in `docs-site` when this was written.
- Step 10, vendoring robkit's packages, holds only until they're on npm. Once `preRelease` is off, check whether `docs/deploy.md` still has it, and drop it from the page if not.
- None of this has run against a real Coolify, as ticket 22 says. If the first real deploy prints something else, this page follows `docs/deploy.md`.
