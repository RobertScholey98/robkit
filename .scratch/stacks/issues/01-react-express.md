# 01: React + Express

**What to build:** `express` becomes a ready stack. It works like `react-hono`, a React page rendered on the server, with Express 5 as the server instead of Hono. That needs a new adapter, `@robkit/express`. This ticket also sets the pattern the next two follow: what adding a stack touches, and how CI covers each stack.

- **Adapter.** `@robkit/express` gives Express what `@robkit/hono` gives Hono: middleware that runs `@robkit/session`'s request guard. It serves the request with the viewer on `res.locals`, typed, or sends the guard's response (the 302 or the 401 lapse contract). It needs the same published-package shape as `@robkit/hono`: README, `api-report.md`, a `*.test-d.ts`, the guard's conformance cases through `@internal/test-session`'s fake core, an entry in `tooling/eslint/package-graph.js`, the adapter row of the layer rule, and the pack check.
- **Template.** `templates/stacks/express` follows react-hono's shape: a page that says who is asking, records a visit through the install's Drizzle layer, and loads the UI kit's stylesheet. It also has `serve.ts`, `AGENTS.md`, `CLAUDE.md`, a `start` script that migrates and then serves, and only runtime imports in `dependencies`.
- **Choices.** Express drops `comingLater`. Both wizards offer it, and `--stack express` works for init and `robkit add`.
- **Whole-stack test.** An `express` install runs every journey the other stacks run, in the pull-request gate.
- **Production.** The production test serves an Express app over https, either as an install's example or as the app it adds.
- **Docs.** The map gets a line for the decision, create-robkit's README says how to add a stack (the checklist this ticket found), the stack AGENTS.md is written, and changesets are added.

**Blocked by:** none

**Status:** ready-for-agent

- [x] `@robkit/express` passes the guard's conformance cases and has the published-package shape
- [x] init `--stack express` and `robkit add --stack express` make a working app, and both wizards offer it
- [x] The generated app passes the install's lint, typecheck, test, format check and `robkit check`
- [x] The whole-stack journeys pass for an Express install in the pull-request gate
- [x] The production test serves an Express app over https
- [x] create-robkit's README lists what adding a stack takes
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### What I chose, and why

Chosen in the build, awaiting R's review.

- **The adapter's API.** `guarded(options)` returns Express 5 middleware, `(req, res, next) => Promise<void>`. It builds a web `Request` from the URL and headers only (from `rawHeaders`, as the dev proxy does), so the body stays unread and `express.json()` can sit after it. It sends the guard's answer with every header, each `Set-Cookie` apart, and the body. Handlers read `res.locals.viewer`, typed by annotating `res: GuardedResponse` (`Response<unknown, GuardedLocals>`). Express can't carry a type from `app.use` to later handlers, so the annotation is the one way; `GuardedLocals` is the shape, like Hono's `GuardedEnv`. An HTTP/1.0 request with no Host gets a 400, since the guard can't tell which page was asked for (Node already refuses HTTP/1.1 without one).
- **Express is a peer dependency** (`^5.1.0`), with `@types/express` an optional peer, since the adapter's declarations name Express's types. Catalog: `express` 5.3.0, `@types/express` 5.0.6.
- **Dev serving.** The template keeps `"dev": "vite"`. A small Vite plugin in `vite.config.ts` loads `src/server.tsx` with `ssrLoadModule` on each request and hands the request to the Express app, after Vite's own middleware (`appType: "custom"`). So the stylesheet and Vite's files are Vite's, as with `@hono/vite-dev-server`, and edits reload without a restart. Production is `vite build` to `dist/serve.js`, which serves `dist/assets` and then the app.
- **Where stack knowledge lives.** In the adapter, `templates/stacks/<stack>`, and `tooling/e2e/src/<stack>.test.ts`. Everything else follows `readyStacks`: the whole-stack test makes one install per stack, each adds an app on the next stack (start → react-hono → express → start), and each runs its own CI workflow. The server-function journey moved from `stack === "start"` to an option Start's test file passes. Lists that must name each stack are typed by `Stack` (`viewerOn` in `generate.test.ts`), and a new repo check, `stack-journeys.test.ts`, fails on a ready stack without its e2e file.
- **Own CI on every install.** Before, only the Start install ran it, so nothing ran lint, the format check, typecheck, tests or the build on an Express app. It adds about 80 seconds to `install-checks.test.ts` in WSL, in parallel with the journeys.
- **Production.** After the first deploy the owner adds an app on every stack but the example's, named after the stack (`reacthono`, `express`), and the test checks each image for extra packages. One more image build per stack; the WSL run's tests took 4 minutes 46 seconds.
- **Wizard order.** Ready stacks come first, so `express` moved above `next`. With three stacks, `robkit.json`'s problem lists them as "start, react-hono or express" (`Intl.ListFormat`).

### Proof

- Red first: the adapter's tests failed before `guarded.ts` existed (28 failed); the create-robkit tests that list stacks failed on the old `choices.ts` (13 failed); `stack-journeys.test.ts` failed with `express.test.ts` moved away.
- `@robkit/express`: 30 tests (the conformance cases, the 401 body read with `readSessionLapsed`, the callback round trip, the untouched body, the HTTP/1.0 request), a types test, and 100% coverage.
- A linked install made with `--stack express` on Windows passed `pnpm lint` (`robkit check` and ESLint), `pnpm typecheck` and `pnpm format:check`, and its built `dist/serve.js` served the stylesheet and ran the guard.
- WSL, `pnpm --filter @internal/e2e test`: 6 files, 48 passed, 2 skipped (the server-function journey on react-hono and express). The Express install ran every journey and its own CI; the react-hono install's added app is on Express.
- WSL, `pnpm --filter @internal/e2e test:production`: 11 passed, including "serves an app on each other stack, added with robkit add, after its next deploy" and the Express image's extra-packages check.

### Not verified

- `pnpm dev` by hand in a browser, outside the whole-stack test.
- Express 5.1 and 5.2, the floor of the peer range. Only 5.3.0 ran.

### For other tickets

- **Tickets 02 and 03:** follow "Add a stack" in `packages/create-robkit/README.md`. Add `tooling/e2e/src/<stack>.test.ts`; pass a journey only your example has as an option to `describeJourneys`, or add it after the call in your file. Adding the stack to `readyStacks` also adds it to the e2e installs, the added-app cycle and the production test's added apps, with nothing to change there.
- The added-app cycle follows `readyStacks`' order. With `next` after `express`, the Express install's added app becomes Next.js, and Next's install adds Start.
- **The ORM layer:** there isn't one any more. Each stack folder carries its own Drizzle files, and the only Drizzle expectation is `generate.test.ts`'s "lays Drizzle's app files over a %s app", which iterates `readyStacks`. Ticket 03 should give `stacks` in `src/choices.ts` a field saying the stack owns its database, and filter that test by it, rather than branch on `go`.
- **Production:** `production.test.ts` adds `slug(stack.replaceAll("-", ""))` for each stack. The Dockerfile is the base template's, the same for every stack today; ticket 03's Go build stage goes there.
- **CI:** `.github/workflows/ci.yml` needs no change for a stack, since `pnpm check:all` runs every e2e file. Ticket 03 adds Go to that job. The production workflow runs on pull requests labelled `production`.
- Docker Desktop's WSL integration was off on this machine (`IntegratedWslDistros: []`). I turned it on for Ubuntu-22.04 to run the Docker suites.
- `packages/create-robkit/README.md`'s "Change a template" step 4 names a digest snapshot in `generate.test.ts` that no longer exists. I left it.
