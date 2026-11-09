# Just use it

## Problem

R wants robkit to be as easy to use as Next.js or Create React App, both to make an install and to build an app in one (R, 2026-11-09). Platform logic should sit behind clean abstractions the owner can extend. A review of the whole repo that day ([research/review-2026-11-09.md](research/review-2026-11-09.md)) found four things in the way:

1. **The first five minutes need a clone.** `npm create robkit` can't run outside a robkit checkout, nothing is published, and a missing Docker or a taken port prints "robkit hit a bug".
2. **An app's files carry platform logic.** Every Node app has a 45-line migrator, a `serve.ts`, and a Vite or Next config that reads robkit's environment through `@robkit/input`. `apps/core` has three source files and an `env -u` line. An owner reads all of it before they find their own code.
3. **Sibling subdomains aren't a boundary yet.** `SECURITY.md` says an imported app can't act as the viewer elsewhere. A browser treats subdomains as same-site, so it can: by posting a form, framing admin, or planting a cookie.
4. **Some deploys and gates skip.** A cancelled CI run can leave an app undeployed, and several repo checks pass changes they exist to catch.

## Outcome

### Making an install

```sh
npm create robkit my-install
cd my-install
pnpm dev
```

`npm create robkit` needs Node 24 and Docker. It writes the install, installs its dependencies, and says what to run next. `pnpm dev` says what is wrong, in one line, when Docker isn't running or a port is taken. `pnpm robkit add notes` works while `pnpm dev` runs, and the new app comes up without a restart.

Nothing is published in this work. Everything up to the publish is built and tested from a local registry, and R triggers the first release.

### An app's files

A React + Hono app after this work:

```
apps/notes/
  package.json        dev, build, start, migrate, db:generate
  vite.config.ts      plugins: [robkit(), devServer(...), tailwindcss()]
  drizzle.config.ts
  drizzle/            migrations drizzle-kit wrote
  src/
    server.tsx        app.use(guarded())
    serve.ts          serve(app)
    database.ts       export const database = appDatabase(schema)
    schema.ts
    visits.ts
```

```ts nocheck
// src/server.tsx
import { guarded, type GuardedEnv } from "@robkit/hono";
import { Hono } from "hono";

const app = new Hono<GuardedEnv>();
app.use(guarded());
app.get("/", (c) => c.text(`Hello, ${c.var.viewer.kind}`));
export default app;
```

No app file imports `@robkit/input`, reads `process.env` for robkit's settings, or runs a migration by hand. `apps/core` is a `package.json` whose scripts run one command.

### The boundary

An imported app on a sibling subdomain can't post to another app as the viewer, can't frame the hub or admin, and can't plant a session cookie that another app or core reads. `SECURITY.md` says what holds and what doesn't.

## Decisions

### R's answers, 2026-11-09

- **Publishing stops short of the publish.** create-robkit works outside the checkout, a release workflow exists, and CI tests an install from a local registry. R adds the npm token and triggers the first release. The names stay `create-robkit` and `@robkit/*`, which are free on npm.
- **Docker stays.** An install is apps on one domain, run with Docker. `pnpm dev` keeps Postgres in Compose. No embedded Postgres.
- **The docs site lives in this repo**, under `site/`, built with Astro. A separate thread builds it once milestones 1 to 3 are merged. It has its own PRD.
- **Access codes stay 5 characters.** The sign-in limit gets harder to get around instead. An attacker can then stop new code sign-ins for a while, which R accepts.
- **The lead merges.** Each ticket is one branch and one PR. A council of Fable 5.2, Sol 6.1 and Opus 5.5 reviews each milestone before it reaches `main`.

### The seam, decided for this work

Each is built by the ticket named, and that ticket's comments record what the build chose.

1. **An app's guard reads its own settings.** Every adapter's `guarded()` works with no argument: it reads `ROBKIT_APP` and `ROBKIT_CORE_URL` itself. A misconfigured app still refuses to start with the reader's message. Options stay, all optional, for tests and for an owner who needs to override one. (07)
2. **The guard knows its own address.** An app's public origin is core's origin with the app's slug in place of `core`: `coreInstall(core).origin(app)`. The guard builds every URL from that, plus the request's path and query. It doesn't read `Host` or `X-Forwarded-Proto`, so a proxy hop that rewrites either changes nothing. (01)
3. **Session cookies are `__Host-` cookies on a hosted install.** A browser refuses a `__Host-` cookie that names a `Domain`, so a sibling can't plant one. A local install keeps the plain names, because the prefix needs `Secure`. Where several tokens arrive, the first live one wins. (02)
4. **The guard refuses a cross-origin write.** A request that isn't GET, HEAD or OPTIONS passes only from the app's own origin, or from a client that sends neither `Sec-Fetch-Site` nor `Origin`. (03)
5. **Core checks whole origins.** Core knows its own origin, so `/refresh` mints only for `next` on the exact origin of admin or an app in the catalog, and CORS allows exactly the hub's and admin's origins. (04)
6. **Drizzle's wiring is a package.** `@robkit/drizzle` gives an app its database in one call, and its `robkit-migrate` command applies the app's migrations in its own schema under a lock. The app keeps `schema.ts`, `drizzle.config.ts` and its migrations. (08)
7. **Dev and build wiring is in packages.** `@robkit/vite` is one Vite plugin, `robkit()`, that sets the dev server up behind the proxy. `@robkit/express` ships the dev handoff Vite needs, and `@robkit/next` ships `withRobkit()` for `next.config.ts`. (09)
8. **Each Node adapter serves in production.** `serve()` from the adapter's `/serve` entry serves the built app on `HOST` and `PORT`. `serve.ts` stays in the app, three lines long, so the owner can put their own code before it. (10)
9. **Core is one command.** `@robkit/core` ships `robkit-core`, which provisions, migrates and serves. `apps/core` has no source. An owner who needs their own core writes a `main.ts` with `createApp`, which stays exported. (11)
10. **create-robkit carries what it needs.** At build it takes in the catalog, the pnpm version, each package's version and the lint policy. A linked install still reads the checkout. (12)
11. **init installs.** `npm create robkit` installs dependencies and makes the first commit unless told `--no-install`. This reverses app-sharing ticket 01's `--install` flag, since an install that needs a second command isn't "just use it". (14)

## Milestones and tickets

Each milestone has a branch that its tickets' PRs target. The council reviews the milestone's PR to `main`.

**1. The subdomain boundary**

1. [The guard knows its own address](issues/01-guard-knows-its-own-address.md)
2. [Host-only cookies a sibling can't plant](issues/02-host-prefixed-cookies.md)
3. [The guard refuses a cross-origin write](issues/03-guard-refuses-cross-origin-writes.md)
4. [Core checks whole origins](issues/04-core-checks-whole-origins.md)
5. [The sign-in limit holds under load](issues/05-sign-in-limit-holds.md)
6. [The platform's pages can't be framed](issues/06-platform-pages-cant-be-framed.md)

**2. An app's files**

7. [`guarded()` needs no arguments](issues/07-guarded-needs-no-arguments.md)
8. [`@robkit/drizzle`: the database and its migrations](issues/08-drizzle-package.md)
9. [Dev and build wiring in packages](issues/09-dev-and-build-wiring.md)
10. [`serve()` in each adapter](issues/10-serve-in-each-adapter.md)
11. [Core is one command](issues/11-core-is-one-command.md)

**3. Making an install**

12. [create-robkit runs outside the checkout](issues/12-create-robkit-outside-the-checkout.md)
13. [A release workflow](issues/13-release-workflow.md)
14. [`npm create robkit` installs and says what's next](issues/14-init-installs.md)
15. [`pnpm dev` says what went wrong](issues/15-dev-says-what-went-wrong.md)
16. [Add an app while `pnpm dev` runs](issues/16-add-while-dev-runs.md)
17. [`pnpm dev` on native Windows](issues/17-native-windows.md) (needs R's answer)

**4. Nothing skipped**

18. [Deploys don't skip](issues/18-deploys-dont-skip.md)
19. [`robkit check` follows what an app can import](issues/19-check-follows-imports.md)
20. [Apps leave the catalog](issues/20-apps-leave-the-catalog.md)
21. [Gates without holes](issues/21-gates-without-holes.md)
22. [The templates, finished](issues/22-templates-finished.md)
23. [The repo's docs match the code](issues/23-docs-match-the-code.md)

## How the work runs

- A worker (Opus 5.5) takes one ticket in its own worktree, builds it with `/tdd`, and opens a PR against the milestone's branch. The lead writes each brief and merges each PR once its `gate` passes.
- Tickets in one milestone that touch different files run at the same time. The ticket says what it is blocked by.
- When a milestone's tickets are in, the lead runs the full gate, then one council round on the milestone's head. Findings the lead confirms are fixed on the milestone's branch, and a fresh round follows until the council is satisfied. The milestone then merges to `main` with a merge commit.
- A decision a ticket leaves open is made in the build and recorded under the ticket's `## Comments` as "chosen in the build", unless it changes what an owner or guest sees in a way this PRD doesn't cover. Those stop and go to R.

## Out of scope

- Publishing to npm or tagging the Go module. R does that.
- Removing Docker from local development.
- Sharing apps between installs (`.scratch/app-sharing/`). R hasn't picked an approach.
- OIDC or any sign-in beyond the owner's password and access codes.
- Deploy targets other than Coolify.
- Ending sessions from admin ("sign out everywhere"), and pruning dead session rows.
- Framing protection for an owner's own apps. Ticket 06 covers the platform's pages and records the gap.
