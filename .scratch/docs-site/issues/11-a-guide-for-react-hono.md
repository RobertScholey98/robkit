# 11: A guide for React + Hono

**What to build:** The first of five stack guides. It sets the headings the other four follow.

- **The app `robkit add` writes, file by file.** Every stack's template is a small working app already: a table, a route that reads and writes it as the viewer, a page that shows it, and a test. The guide walks through those files with ticket 05's component, so the code on the page is the template's own and can't drift. It explains the files a reader will edit and lists the rest in a tree.
- **Make it yours.** Then the reader changes it: a column or a table of their own, the migration, `pnpm robkit migrate`, the route, and its test. Do these steps in a real app made from this checkout before writing them down. These fences are the builder's own. Each compiles under the doc-examples check, or is marked `nocheck` with the reason in the Proof.
- **Links out.** To the shared pages from tickets 09 and 10 for the detail, and to Hono's and Vite's own docs for what isn't robkit's.
- **A test on the file list.** It fails when the template gains or loses a file the guide names. That is how the guide hears about a template change.

The headings are a template for tickets 12, 13, 14 and 15. Record them in this ticket's comments.

Milestone 4 changes the templates (ticket 27 of "Just use it": page titles and error states). The file-list test and the imported files show what moved when that lands, and ticket 26 reads the guides again.

**Blocked by:** 09, 10

**Status:** done

- [x] The guide shows the template's files with the component from ticket 05, and pastes none
- [x] A test fails when the React + Hono template gains or loses a file the guide names
- [x] The "make it yours" steps were done in an app made from this checkout, and the Proof says so
- [x] Every fence compiles, or is `nocheck` with its reason in the Proof
- [x] The headings are in the ticket's comments
- [x] The guide is no longer a stub
- [x] The PR's CI `gate` job passes on GitHub

## Comments

**What I chose**

- The guide adds an app named `notes`, and shows its files under `apps/notes/` with `TemplateFile`'s `app="notes"`. The walkthrough shows `src/schema.ts`, `src/visits.ts`, `src/server.tsx` and `src/routes.test.tsx` whole, and the `routes` function from `src/routes.tsx`. It pastes none of them.
- The rest of the app's files are in a tree. `InstallTree` now takes a `label`, and the entries are in `site/src/app-files.ts`, keyed by stack. A folder entry with no children, such as `drizzle/`, stands for every file under it, so a new migration doesn't fail the test.
- "Make it yours" adds a `note` table, `src/notes.ts` after the pattern of `src/visits.ts`, a `GET /notes` that lists the viewer's notes as JSON, a `POST /notes` that adds one from a form field named `body`, and two tests. `routes` takes the notes as a second argument, and the test's `appAs` defaults it, so the template's own tests stay as they are.
- I filed `.scratch/just-use-it/issues/38-example-test-prints-no-react-warning.md` as needs-triage. Under Vitest the page's stylesheet `href` is empty, and React prints a warning in every test that renders the page. The guide says nothing about it.

**The headings, for tickets 12 to 15**

```text
(a paragraph: what an app on the stack is, and what this guide does)
## Add the app                  pnpm robkit add notes --stack <stack>, and what it asks
## What robkit add writes       <InstallTree entries={appFiles["<stack>"]} label="An app on <stack>" />
## The table                    where the tables are declared, and how the app connects
## The queries                  the example's queries, behind what the routes take
## The routes                   the handlers, the viewer, and why a write is a POST
## The server                   where the guard goes in front of the routes
## The test                     the template's test, then pnpm test
## Make it yours
### Add a table
### Apply the migration         pnpm robkit migrate notes
### Add the queries
### Add the routes
### Test them
## Read more                    the shared pages, then the stack's own docs
```

A stack whose template has no separate file for a heading folds it into the next. Next.js has no server file of its own, and Go keeps its routes and server in `main.go`.

**Proof**

- `site/src/app-files.test.ts` compares the guide's list with `packages/create-robkit/templates/stacks/react-hono`. Its unit tests show it naming a file the folder gained (`unlisted`) and an entry it lost (`missing`).
- The built-site test "the built guide for React + Hono" checks that the page's five template blocks equal the template's files, that the tree lists each entry in order, and that the page isn't a stub. `build-an-app.browser.test.ts` runs axe on the page at 375 and 1280 pixels in both themes, and checks it doesn't scroll sideways at 375.
- I followed "make it yours" in WSL, in an install made with `pnpm create-install --stack react-hono` from d5eaefb4. Ticket 11 doesn't change the template. With `pnpm dev` running:
  - `pnpm robkit add notes --stack react-hono` wrote the 17 files the tree lists.
  - A script made the guide's edits by exact strings. `pnpm db:generate` wrote `drizzle/0001_condemned_leech.sql`, and `pnpm robkit migrate notes` printed "pnpm dev migrated notes." Postgres then had `notes.note` and `notes.visit`.
  - `/` and `/notes` answered 401 to a call with no session.
  - In the app, `pnpm typecheck` exited 0, and `pnpm test` passed 4 tests. In the install, `pnpm lint` exited 0, and Prettier found nothing to change in the app.
- The `schema.ts` fence compiles under the doc-examples check. Six fences are `nocheck`: `src/notes.ts`, two parts of `src/routes.tsx`, the part of `src/server.tsx`, and two parts of `src/routes.test.tsx`. Each imports the app's own files or is part of one, and the check compiles each fence on its own, with no app beside it. All six compiled, passed lint and ran in the app above.
- In the site, the build, `pnpm lint`, `pnpm typecheck` and `pnpm test` pass: 203 tests, browser tests included, at 100% coverage. Of the repo checks, the glossary, doc-examples and command checks pass. The two gofmt tests fail only on Windows, which has no Go.

**What the next tickets need**

- Add the stack's key to `appFiles` in `site/src/app-files.ts`. The test picks it up.
- Copy the built-site test, with the stack's template paths.
- Add the guide's path to `build-an-app.browser.test.ts`.
- For the proof, the script is `wsl-11.sh` with an edit script like `hono11/edit.mjs`, both in the builder's scratchpad. The edit script fails if the template no longer has a line it replaces.

**What milestone 4 will change**

Ticket 27 of "Just use it" changes page titles and error states in the templates. The template blocks and the tree come from the template, so the page follows it, and the file-list test fails if a file comes or goes. "Make it yours" adds its routes after `.post("/visits", ...)` and changes the `routes(visits)` signature. If ticket 27 changes either, ticket 26 should run the steps again.

### Merged

Added by the lead. PR 123 merged into `docs-site` on 2026-11-11 as `b0eb0ee0`, with `gate` green on `87c23ff`. It went in with the catch-up, PR 131, whose `gate` passed on `e2e773e` for the whole stack on milestone 4's templates.
