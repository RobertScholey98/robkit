# 08: Test a route as a viewer

**What to build:** An app's author has no way to test a route as the owner, as a guest with a role, or as nobody. A Go app can, with `session.WithViewer`. A Node app calls `guarded()` as its module loads, the helpers that build a viewer are in the private `@internal/test-session`, every example page writes to Postgres as it loads, and no Node stack's template has a test or a `test` script. A professional kit ships the seam its users test through, and examples worth copying.

- **Viewers a test can build.** Each Node adapter gains a `/testing` entry that exports builders for the owner, a guest with roles, and nobody, so a test never casts to a branded id. The builders are written once, in a `/testing` entry of `@robkit/guard`, where the viewer's types live, and each adapter re-exports them, so an app's author imports from the one package they already use.
- **Hono and Express: a stand-in for the guard.** `@robkit/hono/testing` and `@robkit/express/testing` also export a guard to `use` in place of `guarded()`, which serves every request as the viewer the test names. It refuses to serve when `NODE_ENV` is `production`, which every image sets, so test code copied into a server can't open an app there.
- **Next and Start: test the function, not the request.** Next's `viewer()` reads the request's headers and Start's server functions need Start's compiler, so neither runs under Vitest without faking the stack. Their `/testing` entries export the builders only. The pattern is the page's: it reads the viewer once and hands it to a plain function, and the test calls that function with a built viewer.
- **The main entry can't skip the guard.** No option, setting or environment variable on `guarded()` serves a request without checking it. The API report shows every option. The proof that counts is a test of behaviour: with `NODE_ENV=test`, and with `VITEST` set, each adapter's main `guarded()` still sends a request with no session where it sends one in production.
- **Examples read on GET and record on POST.** Today every example records a visit as its page loads: Hono's and Express's inside `GET /`, Start's from the page's loader, Next's in the page. Ticket 05's rule protects writes that aren't GETs, so the examples should show that shape: the page shows the count, and a button posts to record a visit. The whole-stack journeys that count visits change with it.
  - react-hono's and Express's pages are rendered on the server and have no client script. Their button is an HTML form, and its handler answers with a 303 back to the page. That is the navigating POST ticket 05 covers. Don't add a client bundle for it.
  - The Go stack's API already records with a POST, but its page sends that POST as it loads (`src/main.tsx`). It changes too: the page reads the count with a GET, and its button posts.
- **A test needs no database.** Each example's routes take what they store through as an argument, as the Go stack's `routes(page, record)` does, and the server file passes the real one. A test passes a stand-in. So the install's own CI, which has no Postgres, runs every template test.
- **Each Node stack gets a test.** A `test` script, Vitest, and one test that calls the page as the owner and as a guest. A stack's Vite config must not stop a test run for a missing guard setting, since Vitest loads it with no `pnpm dev` behind it. Vitest runs Vite's `serve` command, so the check has to look at `VITEST`. Confirm Vitest sets it before it loads the config, and record what you found: ticket 10 leans on it.
- **Which config a test loads.** Say it for each stack. Prefer the stack's own `vite.config.ts`, so a test sees the app's plugins. Where a plugin won't load under Vitest, as Start's may not, give that stack a small `vitest.config.ts` and say why in it. Admin has an empty `vitest.config.ts` today only to dodge the guard check; ticket 10 removes it.
- **Docs.** Each stack's `AGENTS.md` gains a short "Testing" section with its pattern, and each adapter's README documents its `/testing` entry and says it is for tests.

**Blocked by:** 07

**Status:** done

- [x] Each Node adapter's `/testing` entry builds the owner, a guest with roles and nobody, with no cast in the test
- [x] The Hono and Express stand-ins serve a request as each kind of viewer, and refuse every request when `NODE_ENV` is `production`
- [x] The builders are written once and every adapter's `/testing` gives the same ones
- [x] The API report shows no option on an adapter's main entry that skips the guard, and with `NODE_ENV=test` or `VITEST` set each main `guarded()` still refuses a request with no session as it does in production
- [x] Every example's page, Go's included, loads without a write and without a POST from the browser, and its button records a visit with a POST; the whole-stack journeys pass
- [x] Each Node stack's template has a `test` script and a test of its page as the owner and as a guest, which passes with no database and no `pnpm dev` running
- [x] The whole-stack test's run of each install's own CI passes with the new tests
- [x] The API reports, READMEs and each stack's `AGENTS.md` cover the entry and the pattern
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### Chosen in the build

- **The builders are `owner(id?)`, `guest({ id?, roles? })` and `nobody()`**, in `packages/guard/src/testing.ts`. They take plain strings and build each id with the guard's own readers, so an empty id throws the reader's problem. The owner's id is `owner-1` and a guest's `code-1` unless the test says. `@robkit/guard`'s main entry now also exports `OwnerViewer` and `GuestViewer`, the builders' return types. `aViewer` in `@internal/test-session` is built on them, so they are written once.
- **The stand-in is `guardedAs(viewer)`**, in `@robkit/hono/testing` and `@robkit/express/testing`. It reads `NODE_ENV` on every request, so a test can stub it after building the app. In production it answers 500, `text/plain` with `no-store`: "This app's server uses guardedAs() from @robkit/hono/testing, which serves only in tests, and NODE_ENV is production. Use guarded() from @robkit/hono." It never calls the app's handlers. It sends none of the guard's headers.
- **The proof that the main entry can't be skipped** is a test in each adapter's `guarded.test.ts`, "in a test run". `testRuns` and `stubRun` in `@internal/test-session` hold the rows: `NODE_ENV` of `test`, of `development`, `VITEST` set, and both. In each, `guarded()` with no options sends a request with no session to core's refresh, as it does with `NODE_ENV=production` and no `VITEST`, and the handler never runs. Making Hono's `guarded()` skip under `VITEST` turned two rows red.
- **react-hono's and Express's button** is `<form method="post" action="/visits">`. `POST /visits` records and answers `303` to `/`. No client script.
- **Go's API.** `GET /api/me` answers who is asking and their count, and records nothing. `POST /api/me` records, then answers the same. The page sends the GET as it loads and the POST from its button.
- **The page's count** is written as one string, `` {`Visits: ${String(n)}`} ``, so React's server render puts no comment inside it and a test can look for `Visits: 1`.
- **The whole-stack journeys.** Every example posts now, so `describeJourneys`'s `posts` option is `"fetch"` (the default: Go, Next, Start, answered 200) or `"form"` (react-hono, Express, answered 303). The cross-origin journey runs on all five, and also checks the button adds one visit and a reload adds none. The lapsed-call and server function journeys expect one visit fewer after a bounce, since a page load records nothing.

### What Vitest does with `VITEST`, for ticket 10

Vitest 5.0.5 sets `VITEST=true`, `TEST=true` and, if unset, `NODE_ENV=test` in `prepareVitest` (`dist/chunks/cli-api.*.js`), before it calls `createVitest`, which loads the Vite config. So a config can read `process.env.VITEST` and see it under `vitest run` and `vitest`. A program that calls `createVitest` from `vitest/node` itself skips `prepareVitest` and doesn't get it. Each Node stack's test passed in a linked install with `ROBKIT_APP` and `ROBKIT_CORE_URL` unset.

Each Vite config now skips its check with `if (command === "serve" && !process.env.VITEST)`. Ticket 10's `robkit()` replaces those lines. Admin's `vitest.config.ts` is untouched.

### Which config each stack's test loads

- **react-hono and Express:** the stack's own `vite.config.ts`, with its plugins (`@hono/vite-dev-server` or the Express plugin, and Tailwind). Under Vitest, `styles.css?url` gives no `href`, so the page's `<link>` has none. The tests don't look at it.
- **Start:** its own `vite.config.ts`, Start's plugin included, so it needs no `vitest.config.ts`. The router plugin writes `src/routeTree.gen.ts` again as it loads, in its own quote style with the same content, as `pnpm dev` does. Prettier and ESLint already ignore that file in an install.
- **Next:** no config. The app has no Vite config, and Vitest's defaults run its `.tsx` with React's automatic runtime.
- **Go:** `go test`, as before.

### The shape of each example, for tickets 09 and 11

- **react-hono:** `src/routes.tsx` exports `routes(visits: Visits): Hono<GuardedEnv>`. `src/server.tsx` is `app.use(guarded())`, then `app.route("/", routes(visits))`, then `export default app`. `src/visits.ts` exports `interface Visits { record(viewerId): Promise<void>; count(viewerId): Promise<number> }` and `visits`, which calls `database()` from `./database.ts` inside each method.
- **Express:** the same, with `routes(visits): Router` and `app.use(routes(visits))`.
- **Next:** `src/visits.ts` exports `Visits` (with `latest(viewerId, limit?)` too), `visits`, `visitorId` and `visitAgainAs(viewer, visits)`. `src/home.tsx` exports `Home({ viewer, visits })`. `src/app/page.tsx` is `<Home viewer={await viewer()} visits={visits} />`, and `src/app/actions.ts` calls `visitAgainAs(await viewer(), visits)`.
- **Start:** `src/visits.ts` exports `Visits`, `visits`, `Shown`, `shownTo(viewer, visits)` and `visitAgainAs(viewer, visits)`. `src/routes/index.tsx` has a GET server function for its loader and a POST one for the button. `src/home.tsx` exports `HomeCard({ shown, onVisitAgain })`.
- **Go:** `routes(page, visits visitStore)`, where `visitStore` has `record` and `count`. `visitsIn(db)` returns `databaseVisits`.

Ticket 09 can swap `database.ts` for `appDatabase(schema)` with no change to `visits.ts`, as long as `database` stays a function. `database.ts`, `migrate.ts` and each `serve.ts` are untouched, and each `serve.ts` still imports the server file's default export.
