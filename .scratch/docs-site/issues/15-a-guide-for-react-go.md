# 15: A guide for React + Go

**What to build:** The React + Go guide, under the headings ticket 11 set, with the same parts: the template's own files shown with the component, the same "make it yours" steps done in a real app first, links out, and a test on the file list.

Cover what differs: Go on the `PATH` and which version, robkit's Go module in `vendor/robkit/go`, the Go migrator, `session.WithViewer` in a test, and the page's calls to the Go server through `sessionFetch`. The Go version the docs promise is being settled in milestone 4 (ticket 25 of "Just use it"). Read it from the template's `go.mod` when the site builds.

**Blocked by:** 11

**Status:** done

- [x] The guide has ticket 11's headings, and shows the template's files with the component
- [x] A test fails when the React + Go template gains or loses a file the guide names
- [x] The "make it yours" steps were done in an app made from this checkout, with `go vet` and `go test` passing, and the Proof says so
- [x] Every `go` fence passes the `gofmt` test, and the Go version on the page is read from the template
- [x] The guide is no longer a stub
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

**What I chose**

- Ticket 11's headings, filled in for Go. What differs from the other stacks:
  - "Add the app" names the Go version with `<InstallVersion tool="go" />`, which reads it from the template's `go.mod` at build time. Today that is 1.26.
  - "What robkit add writes" says `robkit add` copies the guard to `vendor/robkit/go`, shows `go.mod` pointing there, and says `robkit upgrade` replaces that folder whole.
  - "The table" is `migrations/0001_init.sql`, with `migrate.go` as the migrator, since Drizzle doesn't apply to a Go app.
  - "The routes" shows `routes` from `server.go`, and `me` from `src/home.tsx`, which calls the API with `sessionFetch`.
  - "The server" shows `serve` and says to restart `pnpm dev` after a Go change.
  - "The test" shows `server_test.go`, with `session.WithViewer`, and says `pnpm test` runs `go test`, then Vitest for `src/home.test.tsx`.
- "Make it yours" adds the following, then restarts `pnpm dev`:
  - `migrations/0002_add_notes.sql`, applied with `pnpm robkit migrate notes`.
  - `notes.go`, with a `noteStore` and `notesIn(db)`.
  - `GET` and `POST /api/notes` in `routes`, which now takes the store, and `listNotes`.
  - `notes_test.go`, with a map in place of the database.
- Of the seven `go` fences, five are fragments of `server.go` or `server_test.go`. Each is written as declarations or statements that gofmt can read, since the check doesn't honour `nocheck`.
- Milestone 4 moved the page from `src/main.tsx` to `src/home.tsx`, with a test beside it. The file list and the page follow that.
- I dropped my ticket for the start-limit test's race (`36-start-limit-test-waits-for-the-app.md`), since the lead fixed it on `main` as ticket 39.

**Proof**

- `site/src/app-files.test.ts` holds Go's list to `packages/create-robkit/templates/stacks/go`. It failed when milestone 4 added `src/home.tsx` and `src/home.test.tsx`, and passes now they're listed.
- The built-site test "the built guide for React + Go" failed on the stub page. It passes on the guide:
  - Four template files, and three parts, equal the template.
  - The tree lists `appFiles.go`.
  - The page isn't a stub.
- axe finds nothing on the page at 375 and 1280 pixels in both themes, and it doesn't scroll sideways at 375.
- I followed "make it yours" in WSL, in an install made with `pnpm create-install --stack go` from b6111461, which has milestone 4's templates. With `pnpm dev` running:
  - `pnpm robkit add notes --stack go` wrote the files the tree lists.
  - A script made the guide's edits.
  - `pnpm robkit migrate notes` printed "pnpm dev migrated notes.", and Postgres had `notes.note`. The app answered a signed-out request with 401.
  - In the app, `pnpm typecheck` (`go vet` and `tsc`), `pnpm build` and `pnpm test` passed. `pnpm test` ran `go test`, then the page's 4 Vitest tests.
  - In the install, `pnpm lint` passed. Prettier and `gofmt -l` found nothing to change.
  - `fences-in-app.mjs` found each line of the page's `apps/notes/...` fences in the app. The one exception is the `// ...` line in the `routes` signature fence, which stands for the routes it leaves out.
- In WSL, the repo's `site-fences.test.ts` and `go-lint.test.ts` pass on this branch's head, df80123f, the page's gofmt check included.
- In the site, the build, lint, typecheck and all 231 tests pass at 100% coverage. On Windows, the repo checks pass apart from the six gofmt tests, which need Go.

**What the next tickets need**

- Every stack has a guide now, so `appFiles` has all five keys.
- Docker can't publish a port in the ranges Windows reserves, which change at each restart. `netsh interface ipv4 show excludedportrange protocol=tcp` lists them. Postgres ports from 25432 up are clear.

**What milestone 4 changed**

Milestone 4 is merged. Ticket 26 still has the screenshots to take.
