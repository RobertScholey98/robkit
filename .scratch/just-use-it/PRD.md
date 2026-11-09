# Just use it

## Problem

R wants robkit to be as easy to use as Next.js or Create React App, both to make an install and to build an app in one (R, 2026-11-09). Platform logic should sit behind clean abstractions the owner can extend. A review of the whole repo that day ([research/review-2026-11-09.md](research/review-2026-11-09.md)) found four things in the way:

1. **The first five minutes need a clone.** `npm create robkit` can't run outside a robkit checkout, nothing is published, and a missing Docker or a taken port prints "robkit hit a bug".
2. **An app's files carry platform logic.** Every Node app has a 45-line migrator, a `serve.ts`, and a Vite or Next config that reads robkit's environment through `@robkit/input`. `apps/core` has three source files and an `env -u` line. An owner reads all of it before they find their own code.
3. **Sibling subdomains aren't a boundary yet.** `SECURITY.md` says an imported app can't act as the viewer elsewhere. A browser treats subdomains as same-site, so it can: by posting a form, framing a page, or planting a cookie.
4. **Some deploys and gates skip.** A cancelled CI run can leave an app undeployed, and several repo checks pass changes they exist to catch.

## Outcome

### Making an install

```sh
npm create robkit my-install
cd my-install
pnpm dev
```

`npm create robkit` needs Node 24 and Docker. It writes the install, installs its dependencies, and says what to run next. `pnpm dev` says what is wrong, in one line, when Docker isn't running or a port is taken. `pnpm robkit add notes` works while `pnpm dev` runs, and the new app comes up without a restart. `pnpm robkit upgrade` moves the install to a newer robkit.

Nothing is published in this work. Everything up to the publish is built and tested from a local registry, and R triggers the first release.

### An app's files

A React + Hono app after this work:

```
apps/notes/
  package.json        dev, build, start, migrate, test, db:generate
  vite.config.ts      plugins: [robkit(), devServer(...), tailwindcss()]
  drizzle.config.ts
  drizzle/            migrations drizzle-kit wrote
  .env                the app's own settings, kept out of git
  src/
    server.tsx        app.use(guarded()), then the routes
    routes.tsx        the app's routes, which a test can call as any viewer
    serve.ts          serve(app)
    database.ts       export const database = appDatabase(schema)
    schema.ts
    visits.ts
```

```ts nocheck
// src/server.tsx
import { guarded, type GuardedEnv } from "@robkit/hono";
import { Hono } from "hono";
import { routes } from "./routes.tsx";

const app = new Hono<GuardedEnv>();
app.use(guarded());
app.route("/", routes());
export default app;
```

No app file imports `@robkit/input`, reads `process.env` for robkit's settings, or runs a migration by hand. A test can call a route as the owner or as a guest, with no database. `apps/core` is a `package.json` whose scripts run one command.

### The boundary

On an https install, an imported app on a sibling subdomain can't post to another app as the viewer, can't frame admin or another app, and can't plant a session cookie that another app or core reads. A plain-http install is only ever a local one, and robkit refuses to run any other. `SECURITY.md` says what holds and what doesn't.

## Decisions

### R's answers, 2026-11-09

- **Publishing stops short of the publish.** create-robkit works outside the checkout, a release workflow exists, and CI tests an install from a local registry. R adds the npm token and triggers the first release. The names stay `create-robkit` and `@robkit/*`, which are free on npm.
- **Docker stays.** An install is apps on one domain, run with Docker. `pnpm dev` keeps Postgres in Compose. No embedded Postgres.
- **The docs site lives in this repo**, under `site/`, built with Astro. A separate thread builds it once milestones 1 to 3 are merged. It has its own PRD.
- **Access codes stay 5 characters.** The sign-in limit gets harder to get around instead. An attacker can then stop new code sign-ins for a while, which R accepts.
- **The lead merges.** Each ticket is one branch and one PR. A council of Fable 5.2, Sol 6.1 and Opus 5.5 reviews each milestone before it reaches `main`.

### The seam, decided for this work

Each is built by the ticket named, and that ticket's comments record what the build chose.

1. **The guard knows its own address.** An app's public origin is core's origin with the app's slug in place of `core`: `coreInstall(core).origin(app)`. The guard builds every URL from that, plus the request's path and query. It doesn't read `Host` or `X-Forwarded-Proto`, so a proxy hop that rewrites either changes nothing. (01)
2. **Core's one address setting is `ROBKIT_CORE_URL`, and http means local.** Core works its domain, protocol and port out of it, as an app's guard does, and stops reading `ROBKIT_DOMAIN`. With it core compares whole origins: `/refresh` mints only for `next` on the exact origin of admin or an app in the catalog, and CORS allows exactly the hub's and admin's origins. `readCoreUrl` refuses an http origin unless its domain is local, and `pnpm dev` refuses a domain that isn't. So the protocol can decide what the domain's name decides today. (02)
3. **Session cookies are `__Host-` cookies wherever the install is https.** A browser refuses a `__Host-` cookie that names a `Domain`, so a sibling can't plant one. An http install, which decision 2 makes local, keeps the plain names, because the prefix needs `Secure`. (03)
4. **The guard refuses a cross-origin write.** A request that isn't GET, HEAD or OPTIONS passes only when the browser says it came from the app's own origin or from the viewer directly (`Sec-Fetch-Site` of `same-origin` or `none`), or when the client sends neither `Sec-Fetch-Site` nor `Origin`, as a script does. For a WebSocket handshake `Origin` alone decides. The example apps read on GET and record on POST, so what an owner copies is what the rule protects. (05, 08)
5. **The guard sends the framing header itself.** Every answer that passes through the guard carries `X-Frame-Options: SAMEORIGIN` and `nosniff`. It is that header and not a `frame-ancestors` policy because an app may send a policy of its own, and two policy headers don't both survive on Express or Next. A browser obeys `X-Frame-Options` unless the app's own policy names `frame-ancestors`, which is how an app allows a framer. So admin and every app are covered by a package that updates, with no option to learn. (06)
6. **An app's guard reads its own settings.** Every adapter's `guarded()` works with no argument: it reads `ROBKIT_APP` and `ROBKIT_CORE_URL` itself. A misconfigured app still refuses to start with the reader's message. Options stay, all optional. (07)
7. **A test names its viewer, and needs no database.** Each adapter's `/testing` entry builds viewers. For Hono and Express it also gives a stand-in for the guard. For Next and Start, the page reads the viewer once and hands it to a plain function, and the test calls that. An example's routes take what they store through as an argument, so a test passes a stand-in. The main entry has no way to skip the guard. (08)
8. **Drizzle's wiring is a package.** `@robkit/drizzle` gives an app its database in one call, and its `robkit-migrate` command applies the app's migrations in its own schema under a lock. The app keeps `schema.ts`, `drizzle.config.ts` and its migrations. (09)
9. **Dev and build wiring is in packages.** `@robkit/vite` is one Vite plugin, `robkit()`, that sets the dev server up behind the proxy. `@robkit/express` ships the dev handoff Vite needs, and `@robkit/next` ships `withRobkit()` for `next.config.ts`. (10)
10. **Each Node adapter serves in production.** `serve()` from the adapter's `/serve` entry serves the built app on `HOST` and `PORT`. `serve.ts` stays in the app, three lines long, so the owner can put their own code before it. The hub, a built page with no app behind it, uses `servePage()` from `@robkit/vite/serve`. (11)
11. **Core is one command, and provisioning is its own package.** `@robkit/core` ships `robkit-core`, which provisions, migrates and serves. `apps/core` has no source. The code that gives each app its schema and role moves to `@robkit/provision`, below both core and the dev runner. Three placements were weighed: in core with the dev runner importing it (which pulls core, Hono and Drizzle into `npm create robkit`), core depending on `@robkit/dev` (the dev runner in core's image), or a small package below both. (12)
12. **create-robkit carries what it needs.** At build it takes in the catalog, the pnpm version, each package's version, the lint policy and the Go module's source. A linked install still reads the checkout. An install's Go apps reach robkit's Go module in the install's own `vendor/robkit/go`, so robkit's module never waits on a Go proxy or a tag. (13)
13. **A release is a pull request and a button.** Versions change through a "Version packages" pull request, because `main` takes no direct push. A workflow someone starts by hand then publishes what is on `main` that isn't on npm yet, and pushes tags. (14)
14. **init installs.** `npm create robkit` installs dependencies and makes the first commit unless told `--no-install`. This reverses app-sharing ticket 01's `--install` flag, since an install that needs a second command isn't "just use it". (15)
15. **An app's own settings live in its `.env`.** `pnpm dev` loads `apps/<slug>/.env` into that app alone. In production the owner sets them on the host. (17)
16. **`robkit add` tells a running `pnpm dev`.** The runner listens on a local control port and records it in a state file. `robkit add` reports the new app once it is installed, and the runner brings it up. The same channel applies a new migration without a restart. No folder watching. (18)
17. **`robkit upgrade` runs in two steps.** The installed robkit moves the catalog to the new version and installs it. The new robkit then writes what only it holds. It refuses a tree with uncommitted changes, so git shows the owner everything it did. (19)
18. **`robkit check` is a lint, not a boundary.** It catches an app that breaks the layer rule by mistake. What holds an imported app is its database role, its token's audience and its own image. `SECURITY.md` says so. (23)

## Milestones and tickets

A milestone's branch is cut from `main` once the milestone before it has merged, and its tickets' PRs target that branch. Within a milestone, tickets run in the order their `Blocked by` lines allow. Most are serial, because they share the session protocol's files, or every stack's manifest, the package graph, the API reports, the lockfile and the coverage thresholds.

Ticket 26 runs first, beside milestone 1, out of its number's order: it steadies the gate every other ticket has to pass.

**1. The subdomain boundary**

1. [The guard knows its own address](issues/01-guard-knows-its-own-address.md)
2. [Core checks whole origins](issues/02-core-checks-whole-origins.md)
3. [Host-only cookies a sibling can't plant](issues/03-host-prefixed-cookies.md)
4. [The sign-in limit holds under load](issues/04-sign-in-limit-holds.md)
5. [The guard refuses a cross-origin write](issues/05-guard-refuses-cross-origin-writes.md)
6. [No app can be framed from another origin](issues/06-no-framing-from-another-origin.md)

01, 02 and 26 start together. Then 03. Then 04 beside 05. Then 06.

**2. An app's files**

7. [`guarded()` needs no arguments](issues/07-guarded-needs-no-arguments.md)
8. [Test a route as a viewer](issues/08-test-a-route-as-a-viewer.md)
9. [`@robkit/drizzle`: the database and its migrations](issues/09-drizzle-package.md)
10. [Dev and build wiring in packages](issues/10-dev-and-build-wiring.md)
11. [`serve()` in each adapter](issues/11-serve-in-each-adapter.md)
12. [Core is one command](issues/12-core-is-one-command.md)

07 then 08, with 12 beside them. 12 merges before 09 starts, since each adds a package. Then 09, 10 and 11, one after another.

**3. Making an install**

13. [create-robkit runs outside the checkout](issues/13-create-robkit-outside-the-checkout.md)
14. [A release is a pull request and a button](issues/14-release-workflow.md)
15. [`npm create robkit` installs and says what's next](issues/15-init-installs.md)
16. [`pnpm dev` says what went wrong](issues/16-dev-says-what-went-wrong.md)
17. [An app's own settings](issues/17-an-apps-own-settings.md)
18. [Add an app while `pnpm dev` runs](issues/18-add-while-dev-runs.md)
19. [`robkit upgrade`](issues/19-robkit-upgrade.md)
20. [The repo's docs match the code](issues/20-docs-match-the-code.md)
21. [`pnpm dev` on native Windows](issues/21-native-windows.md) (needs R's answer)

13 and 16 start together. 14 and 15 follow 13, and 19 follows both. 17 then 18 follow 16. 20 is last, and the docs site starts once it has merged.

**4. Nothing skipped**

22. [Deploys don't skip](issues/22-deploys-dont-skip.md)
23. [`robkit check` says what it proves](issues/23-check-says-what-it-proves.md)
24. [Apps leave the catalog](issues/24-apps-leave-the-catalog.md)
25. [CI checks without holes](issues/25-ci-checks-without-holes.md)
26. [Tests that don't collide](issues/26-tests-that-dont-collide.md)
27. [The templates, finished](issues/27-templates-finished.md)
28. [The fake core is checked against the real one](issues/28-fake-core-checked-against-real.md)
29. [Access codes are at least 5 characters](issues/29-access-codes-at-least-five.md) (needs R's answer)
30. [Core's error log holds no query parameters](issues/30-error-log-holds-no-parameters.md)
31. [Password sign-in under a flood](issues/31-password-sign-in-under-a-flood.md) (needs R's answer)

22, 23, 24, 28 and 30 start together. 25 follows 22, and 27 follows 23.

## How the work runs

- A worker (Opus 5.5) takes one ticket in its own worktree, builds it with `/tdd`, and opens a PR against the milestone's branch. The lead writes each brief and merges each PR once its `gate` passes.
- Every ticket updates the docs it changes, in the same PR: the package's README, `SECURITY.md`, the stack's `AGENTS.md`. Ticket 20 is the pass over what is left.
- When a milestone's tickets are in, the lead runs the full gate, then one council round on the milestone's head. Findings the lead confirms are fixed on the milestone's branch, and a fresh round follows until the council is satisfied. The milestone then merges to `main` with a merge commit.
- The council reviews each milestone's tickets again before that milestone starts, against the code the milestones before it left.
- A decision a ticket leaves open is made in the build and recorded under the ticket's `## Comments` as "chosen in the build", unless it changes what an owner or guest sees in a way this PRD doesn't cover. Those stop and go to R.

## Out of scope

- Publishing to npm, and tagging the Go module for a Go proxy. R does the first; the second isn't needed while installs carry the module.
- Removing Docker from local development.
- Sharing apps between installs (`.scratch/app-sharing/`). R hasn't picked an approach.
- OIDC or any sign-in beyond the owner's password and access codes.
- Deploy targets other than Coolify.
- Ending sessions from admin ("sign out everywhere"), and pruning dead session rows.
- **A `robkit remove` command.** Ticket 24 takes a removed app out of core's catalog, and the install's `AGENTS.md` says how to remove the rest by hand: its schema and role, and its Coolify application.
- **The hub and admin as packages.** The council's first round asked for `@robkit/hub` and `@robkit/admin`, so their fixes reach existing installs. [ADR 0008](../../docs/adr/0008-packages-update-apps-are-owned.md) says the hub's and admin's pages are copied and owned, so an owner can change them. This work keeps that, and moves what is security or wiring (the guard, the headers, serving, dev wiring) into packages that update.
- **The lint policy as a package.** An install still gets a copy in `tooling/eslint`, which `robkit upgrade` refreshes.
- **A browser with no fetch metadata.** It can't open a gated app: it bounces between the app and the hub. Every browser the templates target has sent `Sec-Fetch-*` since 2023. If it matters later, the fix is a marker in the app's cookie on the way to the hub, so the return trip asks core whatever the browser sends.
- **Files a stack serves without the guard.** An app's built files and anything in its `public` folder are public, as in any web app. Each stack's `AGENTS.md` says so.
- Lint holes that don't bear on the goal: a brand cast through `never`, an aliased `pgSchema`, and Renovate pinning peer ranges. They stay listed in the review.
