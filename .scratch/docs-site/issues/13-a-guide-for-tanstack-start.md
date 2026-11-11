# 13: A guide for TanStack Start

**What to build:** The TanStack Start guide, under the headings ticket 11 set, with the same parts: the template's own files shown with the component, the same "make it yours" steps done in a real app first, links out, and a test on the file list.

Start's server functions change what the guide must cover: a test calls the plain function a handler hands the viewer to, not the server function. Read the template for how the page reaches its server, and say what it does.

**Blocked by:** 11

**Status:** done

- [x] The guide has ticket 11's headings, and shows the template's files with the component
- [x] A test fails when the TanStack Start template gains or loses a file the guide names
- [x] The "make it yours" steps were done in an app made from this checkout, and the Proof says so
- [x] Every fence compiles, or is `nocheck` with its reason in the Proof
- [x] The guide is no longer a stub
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

**What I chose**

- Ticket 11's headings, filled in for Start. Under "The routes" it shows `src/routes/index.tsx` whole and says how the page reaches its server. The loader calls the `GET` server function `shown`, which runs on the server inside the first page load and from the browser after that. The button calls the `POST` server function `visit` through `useServerFn`, as a request to the app's own server, so the guard sees it. "The server" shows `src/server.ts` and `src/start.ts`, which sends server function calls through `sessionFetch`.
- "The test" says the test calls the plain functions in `src/visits.ts`, not the server functions, and so covers neither the guard nor `method: "POST"`. It tells the reader to keep each handler to one call to a plain function.
- "Make it yours" is Start's own. Its table and migration are ticket 11's. `src/notes.ts` holds the queries and the plain functions `notesOf` and `addNoteAs`. `src/routes/notes.tsx` is a page at `/notes` with a `GET` server function for its loader and a `POST` one behind a form. `src/notes.test.ts` calls the plain functions. `addNoteAs` refuses an empty note, so the test covers that, and the `POST` function's `validator` checks that it got a string.
- `site/src/app-files.ts` now shares `drizzleFiles` and `appRootFiles` across the Node stacks. Start's list is its own.
- The built-site test takes each guide's whole files and parts, and compares the tree with `appFiles`.
- The TanStack link goes to https://tanstack.com/start/latest, since the docs' own path has "framework" in it, which the glossary check refuses.

**Proof**

- `site/src/app-files.test.ts` holds Start's list to `packages/create-robkit/templates/stacks/start`.
- The built-site test "the built guide for TanStack Start" checks that six template blocks equal the template's files, that the tree lists `appFiles.start`, and that the page isn't a stub. axe finds nothing on the page at 375 and 1280 pixels in both themes, and it doesn't scroll sideways at 375.
- I followed "make it yours" in WSL, in an install made with `pnpm create-install --stack start` from c492556c. Ticket 13 doesn't change the template. With `pnpm dev` running:
  - `pnpm robkit add notes --stack start` wrote the 22 files the tree lists.
  - A script made the guide's edits. `pnpm db:generate` wrote `drizzle/0001_plain_the_captain.sql`. Within seconds of the route file landing, `pnpm dev` had added `/notes` to `src/routeTree.gen.ts`. `pnpm robkit migrate notes` printed "pnpm dev migrated notes.", and Postgres had `notes.note`.
  - In the app, `pnpm typecheck` exited 0, `pnpm build` exited 0, and `pnpm test` passed 4 tests in 2 files. In the install, `pnpm lint` exited 0, and Prettier found nothing to change.
  - `fences-in-app.mjs` found each line of the page's four `apps/notes/...` fences in the app that ran.
- The first run failed. `useState(Route.useLoaderData())` typed as `() => never`, since the component and the route's type depend on each other, so the page uses `useState<Note[]>`, as the template does with `Shown`. Lint refused two `new Error` messages with fixed text (`robkit/no-bare-error`), so each now names what it got. The guide's code is the second run's.
- The `schema.ts` fence compiles under the doc-examples check. Three fences are `nocheck`: `src/notes.ts`, `src/routes/notes.tsx` and `src/notes.test.ts`. Each imports the app's own files, and the check compiles each fence alone. All three compiled, passed lint and ran in the app above.
- In the site, the build, `pnpm lint`, `pnpm typecheck` and `pnpm test` pass: 217 tests at 100% coverage. Of the repo checks, the glossary, doc-examples and command checks pass. The two gofmt tests fail only on Windows, which has no Go.

**What the next tickets need**

- Next.js and React + Go each need their own list in `appFiles`. Go's has no `drizzleFiles`.
- Add the guide to the `describe.each` in `built-site.test.ts` with its `whole` files and any `parts`. A part ends at the first line that starts with `}`.
- An error a reader's code throws must name what it got, or the install's lint refuses it.

**What milestone 4 will change**

Ticket 27 of "Just use it" adds page titles and error states. On Start that likely touches `src/routes/__root.tsx`, `src/routes/index.tsx` or `src/home.tsx`. The template blocks and the tree follow the template. If it changes the `notesOf` and `addNoteAs` pattern the guide copies from `src/visits.ts`, ticket 26 should run the steps again.
