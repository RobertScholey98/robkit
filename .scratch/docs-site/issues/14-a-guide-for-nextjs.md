# 14: A guide for Next.js

**What to build:** The Next.js guide, under the headings ticket 11 set, with the same parts: the template's own files shown with the component, the same "make it yours" steps done in a real app first, links out, and a test on the file list.

Cover what is Next's own: `withRobkit()` in the config, where the guard runs, and which files Next loads besides the app's `.env`. Milestone 4 may add what `next/image` can show from `public` (ticket 27 of "Just use it"). Say nothing about it until that lands.

**Blocked by:** 11

**Status:** done

- [x] The guide has ticket 11's headings, and shows the template's files with the component
- [x] A test fails when the Next.js template gains or loses a file the guide names
- [x] The "make it yours" steps were done in an app made from this checkout, and the Proof says so
- [x] Every fence compiles, or is `nocheck` with its reason in the Proof
- [x] The guide is no longer a stub
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

**What I chose**

- Ticket 11's headings, filled in for Next. "The routes" shows `src/app/page.tsx`, `src/home.tsx` and `src/app/actions.ts` whole, and says how `src/app/visit-again.tsx` calls the action and why a write is a `POST`. "The server" covers what is Next's own:
  - The guard is the proxy in `src/proxy.ts`, and `viewer()` throws on a path its matcher leaves out.
  - `withRobkit()` in `next.config.ts` puts the build in `dist`, allows the dev proxy's host, turns telemetry off unless you set it, and stops `pnpm dev` without the guard's settings.
  - Next loads `.env.local` and its other `.env` files itself, and `pnpm dev` neither loads nor blocks them.
- The page says nothing about `next/image` and `public`, as the ticket asks.
- "Make it yours" adds `src/notes.ts`, with queries and the plain functions `notesOf` and `addNoteAs`, reusing `visitorId` from `src/visits.ts`. It adds a page at `src/app/notes/page.tsx`, whose form posts to a server action in `src/app/notes/actions.ts`, which calls `revalidatePath("/notes")`, and adds `src/notes.test.ts`.
- The tree lists the 24 files the template writes, with `.gitignore` under its own name. The file-list test names each template file as `installPath` does, since the template keeps it as `gitignore`. A line under the tree says `next dev` also writes `dist/` and `next-env.d.ts`, which git ignores.
- `src/home.tsx` is shown whole. A part ending at the first line that starts with `}` stops at `}: {` in `Home`'s signature.

**Proof**

- `site/src/app-files.test.ts` holds Next's list to `packages/create-robkit/templates/stacks/next`.
- The built-site test "the built guide for Next.js" checks that seven template blocks equal the template's files, that the tree lists `appFiles.next`, and that the page isn't a stub. axe finds nothing on the page at 375 and 1280 pixels in both themes, and it doesn't scroll sideways at 375.
- I followed "make it yours" in WSL, in an install made with `pnpm create-install --stack next` from e0907d1d. Ticket 14 doesn't change the template. With `pnpm dev` running:
  - `pnpm robkit add notes --stack next` wrote the 24 files the tree lists. `next dev` had also written `dist/` and `next-env.d.ts`.
  - A script made the guide's edits. `pnpm db:generate` wrote `drizzle/0001_pale_deathstrike.sql`, `pnpm robkit migrate notes` printed "pnpm dev migrated notes.", and Postgres had `notes.note`.
  - In the app, `pnpm typecheck` exited 0, and `pnpm build` exited 0 with `/notes` among its dynamic routes. `pnpm test` passed 4 tests in 2 files. In the install, `pnpm lint` exited 0, and Prettier found nothing to change. It all passed on the first run.
  - `fences-in-app.mjs` found each line of the page's five `apps/notes/...` fences in the app that ran.
- The `schema.ts` fence compiles under the doc-examples check. Four fences are `nocheck`: `src/notes.ts`, `src/app/notes/actions.ts`, `src/app/notes/page.tsx` and `src/notes.test.ts`. Each imports the app's own files, and the check compiles each fence alone. All four compiled, passed lint and ran in the app above.
- In the site, the build, `pnpm lint`, `pnpm typecheck` and `pnpm test` pass: 224 tests at 100% coverage. Of the repo checks, the glossary, doc-examples and command checks pass. The two gofmt tests fail only on Windows, which has no Go.

**What the next tickets need**

- React + Go's list has no `drizzleFiles`. Its migrations are in `migrations/`.
- In `built-site.test.ts`, a part now ends at the first line that is exactly `}`, even at the end of the file. The page's `to="^}"` ends at the first line that starts with `}`, so pick parts where the two agree.

**What milestone 4 will change**

Ticket 27 of "Just use it" adds page titles, error states and maybe what `next/image` can show from `public`. Ticket 26 adds that to this guide once it lands. The template blocks and the tree follow the template, and the file-list test fails if a file comes or goes.
