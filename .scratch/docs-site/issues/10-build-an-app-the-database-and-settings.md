# 10: Build an app: the database, settings and the layer rule

**What to build:** The pages a builder reads, whatever their stack, about their app's data and settings.

- **The database.** The app's own schema, `appDatabase()`, adding a table, generating a migration, and `pnpm robkit migrate <slug>` while `pnpm dev` runs. What a Go app does instead.
- **Settings.** The app's `.env`, what wins over what (the runner's own settings, then the shell, then the file), and that a test runs with no `pnpm dev` behind it. The names the file can't set are a rule, not only a list: the runner's own names, any name that starts `ROBKIT_`, and `NODE_ENV`. The page states the rule and links to the table in ticket 21, which has the one test of the list.
- **A value the browser reads.** A `VITE_*` or `NEXT_PUBLIC_*` value works under `pnpm dev` and isn't in a production image. Say what works today: read the setting on the server and hand it to the page. Whether robkit does more is R's to decide (ticket 32 of "Just use it"), so the page promises nothing.
- **The layer rule.** What an app may import, and what `robkit check` says when it doesn't. Milestone 4 changes what the docs say this check proves (its ticket 23). Write what the code does on this branch.

**Blocked by:** 03, 05

**Status:** done

- [x] Every sample compiles, for every stack it shows
- [x] Following the database page in an app made from this checkout adds a table and applies its migration in a running `pnpm dev`, and the Proof says how that was run
- [x] The settings page gives the order of precedence the code has, and the Proof names where
- [x] The layer rule page's messages are ones `robkit check` prints
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

**What I chose.**

- Three pages in Build an app, after the viewer pages: "The database" (order 8), "Settings" (order 9) and "The layer rule" (order 10). "A value the browser reads" is a section of Settings.
- **The database:**
  - The app's own schema and role, and each stack's database code, from the example app's files.
  - Adding a table to an app named `notes`. On the Node stacks, a `ts` fence of the table and `pnpm db:generate`. On Go, a `sql` fence of `migrations/0002_add_notes.sql`.
  - Then `pnpm robkit migrate notes`, and what a migration may and may not do.
- **Settings:**
  - The app's `.env`, and what wins, in `appEnv`'s order.
  - The rule for the names the file can't set, linking to `reference/settings`, a stub for ticket 21.
  - Setting a value in a test, on each stack, and where settings go in production.
  - A value the browser reads. The page says only what works today: read it on the server and hand it to the page.
- **The layer rule:** the four rules as the install's `AGENTS.md` gives them, what `robkit check` prints for an install that breaks each one, and how to fix each line. I left out "call the other app over HTTP": another app's guard would refuse a server's call that has no session.
- **New fence mark.** A fence marked `sh app` runs in an app's folder. Ticket 04's command check now holds its scripts to those every Node stack's app has, found as the stacks without a `go.mod`.

**Proof.**

- **The database page, followed in WSL** (Ubuntu 22.04, Node 24, Go 1.26) by `scratchpad/wsl-10.sh`, from a clone of `6f0cc129`:
  - `pnpm create-install` made an install with React + Hono's example, and `pnpm dev` started it.
  - With it running, `pnpm robkit add notes --stack react-hono` and `pnpm robkit add jotter --stack go` added two apps. Postgres had no `note` table.
  - On notes, I added the page's table to `src/schema.ts` and ran `pnpm db:generate` in `apps/notes`, which wrote `drizzle/0001_minor_dust.sql`. `pnpm robkit migrate notes` printed "pnpm dev migrated notes."
  - On jotter, I added the page's `migrations/0002_add_notes.sql`, and `pnpm robkit migrate jotter` printed "pnpm dev migrated jotter."
  - Postgres then had `jotter.note` and `notes.note`. Both apps still answered, with the guard's 401 for a call without a session. Running both migrations again passed.
- **Samples compile.**
  - The Node stacks' table is a `ts` fence, and the repo's doc-examples check compiles it against `drizzle-orm`.
  - Every other sample is a template file or part of one, read at build time.
  - The `pnpm db:generate` fences pass the new `app` check. `site-fences.test.ts` fails a script an app doesn't have.
- **What wins** is `appEnv` in `packages/dev/src/app-env.ts`: `appDefaults`, then the app's own file, then the shell, then `appSettings`, each spread over the last. `whyRefused`, in the same file, refuses `appSettings`' names, any `ROBKIT_` name and `NODE_ENV`. `appSettings` sets `VITEST` and `ROBKIT_DATABASE_URL` to nothing, which `appEnv` drops, so the page says the app doesn't get them from the shell.
- **The layer rule's messages.** `built-site.test.ts` makes an install with `init`, writes four files that each break one rule, and runs `robkit check` there with Node. It checks the exit code is 1 and the page's "What it prints" block equals stdout. It was red before the page existed.
- **Browser and checks.** `build-an-app.browser.test.ts`: axe finds nothing on the three pages at 375 and 1280 px in both themes, and none is wider than 375 px. On Windows, the site's build, lint, typecheck, all 194 tests with 100% coverage, `pnpm knip`, Prettier, and the repo's glossary, doc-examples, link and command checks pass. The two gofmt tests need Go, which this Windows machine lacks. I looked at the layer rule and settings pages at 1280 px light and 375 px dark.

**For the next tickets.**

- Mark a fence of commands run in an app's folder `sh app`.
- A fence can name what it shows with `title="..."`, which the bar shows. Use a `dotenv` fence for an `.env`, since an `sh` one gets a `$` before each line.
- Ticket 21 fills `reference/settings`, which is a stub now. The settings page links to it.
- The site can import `init` and `defaultChoices` from `create-robkit` to make an install in a test.

**What milestone 4 will change on these pages.**

- Ticket 23 of "Just use it" changes what the docs say `robkit check` proves. The layer rule page says what it does on this branch. A changed message fails the page's test.
- Ticket 32 decides whether robkit does more for a value the browser reads. The page promises nothing.
- Ticket 27 finishes the templates. A changed line that a part starts or ends on fails the build.
