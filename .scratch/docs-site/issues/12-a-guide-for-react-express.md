# 12: A guide for React + Express

**What to build:** The React + Express guide, under the headings ticket 11 set, with the same parts: the template's own files shown with the component, the same "make it yours" steps done in a real app first, links out, and a test on the file list.

Say what differs from React + Hono, since a reader choosing between them will look for it.

**Blocked by:** 11

**Status:** done

- [x] The guide has ticket 11's headings, and shows the template's files with the component
- [x] A test fails when the React + Express template gains or loses a file the guide names
- [x] The "make it yours" steps were done in an app made from this checkout, and the Proof says so
- [x] Every fence compiles, or is `nocheck` with its reason in the Proof
- [x] The guide is no longer a stub
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

**What I chose**

- The guide uses ticket 11's headings. What differs from React + Hono is a short list under the opening paragraph, with no heading of its own: an Express `Router` and `res.locals.viewer`, a body the route parses itself, and a test that serves the routes on a loopback port and calls them with `fetch`.
- React + Express has the same files as React + Hono, so `site/src/app-files.ts` builds both lists with `serverApp`, which takes only what `src/server.tsx` holds.
- "Make it yours" is ticket 11's, with Express's own routes. `POST /notes` runs `express.urlencoded()` for that route only, since the guard never reads a body. Express types `req.body` as `any`, and the install's lint refuses an `as` on it (`no-unsafe-type-assertion`), so the route narrows it with `typeof` and `in`.
- The built-site test is now a `describe.each` over both guides.
- The Express app's test prints the same React warning as React + Hono's. Ticket 35 now says so.

**Proof**

- `site/src/app-files.test.ts` holds the Express list to `packages/create-robkit/templates/stacks/express`.
- The built-site test "the built guide for React + Express" checks that the five template blocks equal the template's files, that the tree lists each entry, and that the page isn't a stub. axe finds nothing on the page at 375 and 1280 pixels in both themes, and it doesn't scroll sideways at 375.
- I followed "make it yours" in WSL, in an install made with `pnpm create-install --stack express` from 87c23ff1. Ticket 12 doesn't change the template. With `pnpm dev` running:
  - `pnpm robkit add notes --stack express` wrote the 17 files the tree lists.
  - A script made the guide's edits by exact strings. `pnpm db:generate` wrote `drizzle/0001_clammy_lady_ursula.sql`, and `pnpm robkit migrate notes` printed "pnpm dev migrated notes." Postgres then had `notes.note`.
  - In the app, `pnpm typecheck` exited 0, and `pnpm test` passed 4 tests. In the install, `pnpm lint` exited 0, and Prettier found nothing to change in the app.
  - A script then checked that each line of each `apps/notes/...` fence on the page is in that file of the app. It found every line, and so it did for ticket 11's guide.
- The first run failed the install's lint, on `(req.body ?? {}) as { body?: unknown }`. The guide's code is the second run's.
- The `schema.ts` fence compiles under the doc-examples check. Six fences are `nocheck` for ticket 11's reason: `src/notes.ts`, two parts of `src/routes.tsx`, the part of `src/server.tsx`, and two parts of `src/routes.test.tsx`. Each imports the app's own files or is part of one. All six compiled, passed lint and ran in the app above.
- In the site, the build, `pnpm lint`, `pnpm typecheck` and `pnpm test` pass: 210 tests at 100% coverage. Of the repo checks, the glossary, doc-examples and command checks pass. The two gofmt tests fail only on Windows, which has no Go.

**What the next tickets need**

- TanStack Start, Next.js and React + Go have files of their own, so each needs its own list in `appFiles`, not `serverApp`.
- Add the guide to the `describe.each` in `built-site.test.ts`. Its test assumes a `src/routes.tsx` whose `routes` function ends at a line starting with `}`, so a stack without one needs its own blocks there.
- The WSL script is `wsl-guide.sh <branch> <stack> <name> <postgres port>`, with `<name>/edit.mjs` and `<name>/notes.ts`. `fences-in-app.mjs <page> <name>-out` checks the page's fences against what ran. All of these are in the builder's scratchpad.

**What milestone 4 will change**

As for ticket 11. The template blocks and the tree follow the template. If ticket 27 of "Just use it" changes `routes(visits)` or the `/visits` route, ticket 26 should run the steps again.
