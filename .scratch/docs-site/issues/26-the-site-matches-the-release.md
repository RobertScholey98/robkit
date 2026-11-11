# 26: The site matches the release it describes

**What to build:** The site is written while milestone 4 of "Just use it" changes robkit beside it. Before `docs-site` merges to `main`, the site has to describe the code that will be released, with no known mismatch left.

- **Merge `main` into `docs-site`**, with milestone 4 in it.
- **Let the checks speak first.** The command reference, the settings reference, the package pages, the file-list tests and the imported template files fail or change by themselves where robkit moved. Fix each.
- **Then read what no check holds.** Run the script from ticket 03 over the files milestone 4 changed, and read each page it prints against the code. Each content ticket's comments list what milestone 4 would change on its pages: go through those lists.
- **Take the screenshots again** with ticket 08's command, since the hub changed.
- **No stub is left.**
- **Every page, in a browser.** Run axe over every built page, in light and dark, at 375 and 1280 pixels wide.
- **Record the commit** of `main` the site was read against, in this ticket's comments. The second council round reviews the site at the commit this ticket ends on.

**Blocked by:** 25; every ticket before this one, and milestone 4 of "Just use it" merged to `main`

**Status:** done

- [ ] `docs-site` holds `main` with milestone 4 merged, and CI's `gate` passes on it
- [x] Each item in the content tickets' "what milestone 4 will change" lists is done or shown not to apply, and the Proof goes through them
- [x] The screenshots were retaken, and their record names the new commit
- [x] The stub count is zero, and a test fails on a stub from now on
- [x] axe finds nothing on any page, in either theme, at either width
- [x] The ticket's comments name the commit of `main` the site describes
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### Done early, in the catch-up with milestone 4 (PR 131)

The branch `docs-14b-catch-up-with-main` merged `docs-site` at `7bc45f2a`, which holds `main` with milestone 4, into the stack up to ticket 14. It brought these up to milestone 4:

- **The checks spoke first.** The build and all site tests passed after the merge. No `<TemplateFile>` part broke, and the file lists for Start, React + Hono, React + Express and Next.js still matched. Ticket 15 lists Go's new `src/home.tsx` and `src/home.test.tsx`.
- **The guides' "make it yours" steps ran again**, for React + Hono, React + Express, TanStack Start and Next.js. Each ran in an app made from milestone 4's templates, with `pnpm dev`, the migration, typecheck, build, tests and lint. No fence needed a change. React + Go's guide, ticket 15, was written against milestone 4.
- **The layer rule page** has milestone 4's fifth rule and a section on what `robkit check` doesn't stop. That covers ticket 10's item on just-use-it ticket 23.
- **Start's test and Go's page test.** The Start guide and "Testing with a viewer" say that Start's test presses the card's button, and that a React + Go app's page has its own test.
- **The layer rule and `.d.ts` files.** Once just-use-it ticket 42's fix reached `docs-site`, ticket 19's branch gave the fifth rule the install `AGENTS.md`'s sentence, that a `.d.ts` file may import another from a folder `robkit check` doesn't read. The security page builds the ways past the lint from `SECURITY.md`, so it has "A `.d.ts` file with code in it" already. In WSL, in a Next install made from that branch, `pnpm lint` exited 0 after `pnpm dev`, whose `next-env.d.ts` imports from `./dist/dev/types`, and again after `pnpm build`. Neither the Next.js guide nor this ticket says lint fails there.
- **Ticket 16** was written after the catch-up. It describes removing an app and the socket in `~/.robkit/run` as milestone 4 made them.

### Left for this ticket

- **The screenshots.** The hub changed: the intro link's question, the launcher's "Try again" and its note when an app sends a viewer straight back. Run `pnpm screenshots` again and fix the words in `screenshots.ts` to match (ticket 08's item).
- **`next/image` and `public`.** Next's template `AGENTS.md` now has an "Images" section: `<Image>` can't optimize a file in `public`, since the guard refuses the optimizer. The Next.js guide and the line on built files in "The viewer and the guard" say nothing about it yet (tickets 09 and 14).
- **The rest of the content tickets' lists**, not checked in the catch-up: ticket 02's native Windows item (just-use-it ticket 21), ticket 06's home page items, and ticket 07's set-up form and `case "owner":` items. The build would have failed on a lost `case "owner":` line, and it didn't.
- **This ticket's own steps.** Ticket 03's script over the files milestone 4 changed, the stub count and its test, axe on every page, the commit of `main` the site describes, and `preRelease` once robkit is on npm.

### Built on `docs-26-matches-the-release`

#### What I chose

- **The site describes `main` at `2d3c0422`.** `main` has two commits `docs-site` lacks, and both only record the merges of just-use-it tickets 60 and 61 in their ticket files. So the site already holds all of `main`'s code, milestone 4 included. I was told not to merge `main` myself, so the first box waits for the lead's merge. `docs-site` also carries package changes `main` doesn't have yet, such as the exports the site reads, and they reach `main` with the site.
- **Stubs.** None was left. `pages.test.ts` now fails if any page sets `stub: true` or says it isn't written. The stub machinery stays, so a page can be drafted on a branch.
- **axe on every page.** `every-page.browser.test.ts` finds the pages in `dist/`, so the home page, the 404, the samples page and any new page are checked with no edit. It runs axe at 375 and 1280 pixels in both themes, and checks nothing but a code block is wider than 375. Six section browser tests held only those checks over hand-kept lists, and I removed them in a commit of their own.
- **Screenshots.** `pnpm screenshots` now takes `ROBKIT_POSTGRES_PORT` from the shell when it's set, so a run in WSL could use 25443. It ran from a fresh clone of `8546157f`. All seven pictures came out byte for byte the same as before, so only `record.json` changed. The hub's changes in milestone 4 are on screens the pictures don't show.
- **Ticket 03's script** ran over every file `main` changed from just before milestone 4's merge (`e625ab70^1`) to `2d3c0422`, 235 files. It named 23 pages. Three readers checked each page's prose against the code at this branch's head. Each finding below was checked against the code again before I changed the page.
- **`preRelease` stays on.** robkit isn't on npm yet.

#### What changed on the pages

- **The five stack guides** said `robkit add` asks who may open the app and its emoji. The command they show passes `--stack`, and with any option it asks nothing. They now say so, and name `--access` and `--icon`.
- **Testing with a viewer** said every stack's adapter has a `/testing` entry. Go has none, and its test builds `guard.Owner` and the rest itself.
- **React + Hono and React + Express** now name `visitorId` and `headingFor` beside the `Page` component in `routes.tsx`.
- **Next.js:**
  - It gains an "Images" section from the template's `AGENTS.md`, held to it by a test. The 401 holds only for an app that isn't open to anyone, since an open app lets the optimizer through.
  - `withRobkit()`'s check runs whenever `next dev` starts.
  - `visits.ts` has two functions that take a viewer.
- **The viewer and the guard** says a Next app's `public` files go through the guard. It also says Go's guard refuses a handshake from another origin, since one with no `Origin` passes.
- **Security** says the same of a Next app's `public` files, as `SECURITY.md` does.
- **pnpm dev and your apps:**
  - `pnpm dev` routes a new app's subdomain last, after the new core.
  - A returning app loses the rule set in admin. It can get its roles back.
- **The robkit command:**
  - `robkit upgrade` prints its own usage text, as does `robkit migrate` for the wrong number of arguments.
  - Upgrade moves the Go module only with a Go app.
  - `robkit add` also refuses a bad icon, and Go on a machine without Go.
- **Every setting:**
  - `ROBKIT_APPS` leaves out the platform apps, and an empty list empties core's catalog.
  - The robkit-set section no longer says `pnpm dev` sets every one.
- **The other packages:** `pnpm dev` gives a database only to an app with a `migrate` script.
- **The Go module:** `OnUnavailable` also hears when core answers without its key set or the rule.
- **Deploy to Coolify:**
  - It lists the refusal for a name in `coolify.json` that Coolify lacks.
  - It says `robkit deploy` uses only the shared variables' names.
- **Left as they are, with a reason:**
  - How it works describes `/refresh` for a page load, which is the case it draws.
  - The database page's line on `robkit add` asking `pnpm dev` holds outside native Windows, which the site doesn't support.

#### The content tickets' lists

- **02.** "WSL on Windows" stays, since just-use-it ticket 21 is still `needs-info`. "Before the first release" stays while `preRelease` is on.
- **06.** The README's quickstart and the react-hono handler are read at build time, and the build passes. robkit still deploys to Coolify alone.
- **07.**
  - "In another terminal" still holds after just-use-it ticket 34, which makes every terminal agree.
  - The set-up form still asks for 12 characters and has "Create owner".
  - The build would fail on a lost `case "owner":`, and it doesn't.
- **08 and 15.** The screenshots were retaken, as above.
- **09 and 14.** The `next/image` item is done.
- **16, 22, 23 and 24.** Nothing left.
- **19.** The written parts of Security and How it works were read again, and the fixes are above.
- **20 and 21.**
  - The reference tests pass against milestone 4.
  - `ROBKIT_APPS`' section now says what an empty list does.
  - `deploymentOf` still sets `PORT` to 3000.

#### Proof

- **Tests:**
  - In `site/`, `pnpm build`, `pnpm lint`, `pnpm typecheck` and `pnpm test` pass, with 508 tests at 100% coverage, 181 of them from `every-page.browser.test.ts`.
  - At the root, `pnpm knip`, `pnpm format:check`, the glossary test and `check-coverage-thresholds.ts origin/docs-site` pass.
  - `site-fences.test.ts` passes but for its two Go tests, which need `gofmt`, and this machine has no Go. No Go fence changed.
- **Broken on purpose:**
  - With `stub: true` on the glossary, the stub test failed.
  - With the `unoptimized` line taken off the built Next guide, the images test failed.
- **The screenshot run:** in WSL, `ROBKIT_POSTGRES_PORT=25443 pnpm screenshots` from a fresh clone of `8546157f`. Its `git status` showed only `record.json` changed, and the PNGs' sha256 match the committed ones.

#### Found outside the site

- [Just-use-it ticket 43](../../just-use-it/issues/43-next-images-in-an-open-app.md): the Next template's `AGENTS.md` says the guard refuses the optimizer with a 401, which an open app doesn't.

#### For the lead

- The first box waits on your merge of `main` into `docs-site`. It brings only the two ticket files.
- `preRelease` goes off once robkit is on npm, and the quickstart, the home page and the Markdown copies follow it. Step 10 of the deploy guide doesn't, so check it against `docs/deploy.md` then.
