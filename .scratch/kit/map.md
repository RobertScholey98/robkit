# Map: robkit v0.1

## Destination

A decided spec and ordered PR list for robkit v0.1. `npm create robkit` scaffolds a monorepo with the platform (Hono core, a React hub with access-code login, admin, shared Postgres). `robkit add` opens a selector of stack templates (v0.1: TanStack Start, and React with Hono) and drops in an app that already has auth, a database schema and a subdomain. All of it runs locally with one command. Deploys use R's existing Coolify method for now.

## Notes

- **Product:** painless self-hosting of small, often vibe-coded, apps for friends and family. Auth, database, routing and the launcher come built in. The templates are stacks, not R's apps. robkit is a self-hosting cookbook shared with the community, so the init options are part of the product; R's own suite of apps will be a fork of this repo.
- **Reference, not base:** `C:\Users\rober\code\robnet` (to be renamed `robnet_inspiration`). Borrow its ideas (guard outcome table, access codes and intro links, launcher, admin settings, ui tokens), not its Start-specific glue.
- **Architecture draft:** the Robnet Platform docs site (https://claude.ai/artifact/Ps4buZoTFDtdaDZycwcP68): a framework-free core on web Request/Response, one server adapter per stack, plus client adapters.
- **Domain:** robkit.dev, for testing once the kit works locally.
- **Skills:** grilling and domain-modeling for every grilling ticket. Ask R one question at a time on a decision card.
- **Appetite:** radical choices welcome, nothing for its own sake. The goal is a repo a reader finds slick and clean.

## Decisions so far

- **v0.1 scope (charting):** local first. Deploys use R's Coolify method; other deploy targets are out of scope.
- **v0.1 stacks (charting):** TanStack Start, and a React SPA with a Hono backend.
- **init choices (charting):** init also configures the repo: package manager (pnpm, bun, yarn), an optional shared React UI kit ("Add a shared React UI kit? (y/n)", then which one: shadcn, Radix, Base UI, Chakra and so on), an ORM (Drizzle recommended, Prisma, Kysely), Tailwind by default, and dev tools (tests, lint, Husky). How these compose is [How are templates composed from init's choices?](issues/04-template-composition.md).
- [What do pnpm, bun and yarn each support for a robkit monorepo?](issues/02-package-managers.md): all three, through an adapter table of rendered files. pnpm is the tier-1 default; bun and Yarn (node-modules linker, no PnP) are tier 2 behind per-manager CI.
- [What do existing create-stack CLIs already solve?](issues/01-prior-art.md): none upgrades a project or adds a whole app; copy Better-T-Stack's layered generator shape rather than forking it, and keep platform code in versioned packages.
- [What does a robkit user upgrade, and how?](issues/05-upgrade-path.md): the Ignite model. Apps, hub and admin pages, config and templates are copied and owned; session, guard, core and adapters are `@robkit/*` packages updated by a version bump. No eject.
- [How are templates composed from init's choices?](issues/04-template-composition.md): robkit's own Better-T-Stack-shaped generator with a saved `robkit.json`; `add` uses the CLI's templates, overridable from `robkit/templates/<stack>`; tooling is repo-wide and only the UI kit is per-app opt-in.
- [Where does core run?](issues/08-where-core-runs.md): core is its own Hono backend and the only owner of the core tables and the signing key; the hub is a lightweight React frontend.
- [What session token and guard does the kit ship?](issues/07-session-and-guard.md): Ed25519 JWT signed only by core, verified locally via JWKS, same cookie and `/refresh` flow as robnet; login is access codes only; access comes from owner-defined roles held by codes, and each app is gated to roles in admin.
- [How does each app get its database?](issues/09-app-databases.md): one Postgres with a schema and a locked-down role per app (core included); a per-app migrate step runs before each new container starts; init picks a repo-wide ORM (Drizzle recommended, Prisma, Kysely) over an ORM-agnostic contract.
- [Are the hub and admin fixed apps, independent of the user's UI choice?](issues/06-platform-apps-ui.md): no, they follow the chosen UI kit; with no kit they are plain JSX and Tailwind styled like robnet's current shadcn look.
- [What is robkit's domain glossary?](issues/03-domain-glossary.md): 20 terms in `GLOSSARY.md`; hub (login and launcher UI) and core (Hono backend) are distinct; one owner per install, claimed on first run (the Coolify model), everyone else a guest; roles, not grants.
- [How should the init and add wizards flow?](issues/11-cli-flow.md): as in the clickable prototype; no domain prompt (`ROBKIT_DOMAIN` is runtime config, default `localhost`); no owner-login prompt either (the owner claims the install on first run); init always adds an example app and a local-only all-access code `test`.
- [What does each template ship for coding agents?](issues/12-agent-instructions.md): root and per-app `AGENTS.md` (per stack and ORM), a one-line `CLAUDE.md` pointing at it, and a `robkit check` that is the single implementation of the layer rule, shipped whatever linter was chosen.
- [How does robkit test itself?](issues/13-kit-testing.md): generate real projects; pairwise set (~12) plus one end-to-end journey per stack on each PR, full 72-combination matrix nightly.
- [What does one-command local dev look like?](issues/10-local-dev.md): Postgres in Compose, every app native via `turbo dev`, and a robkit proxy on `:3000` routing `*.localhost` so URLs and cookies match production. Refined by build ticket 02 (R, 2026-10-31): core answers on `core.<domain>`, and a `robkit-dev` runner from `@robkit/dev` starts each `apps/<slug>` itself instead of `turbo dev`, so the folder name is the subdomain.
- [Assemble the v0.1 spec and PR list](issues/14-assemble-spec.md): the destination, written up as the robkit v0.1 spec doc (https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5) with 18 ordered PRs. Superseded for ordering by the 21 vertical tickets in `v0.1-build/issues`, where the first hosted install (11) comes before the other ORMs, package managers and kits (R, 2026-10-29).
- [The owner claims the install and signs in](../v0.1-build/issues/03-owner-claims-and-signs-in.md) (build ticket 03, R, 2026-11-01): the setup screen stays open with no one-time token, as in Coolify, so the owner claims a hosted install as soon as it's up. Core generates its Ed25519 key on first boot and keeps the private half in its own schema, not in env. The default `ROBKIT_DOMAIN` becomes `robkit.localhost`, because Chromium and Firefox reject a `Domain=localhost` cookie; this replaces the `localhost` default in the CLI-flow and local-dev decisions, and the `test` code works while the domain ends in `.localhost`.
- [A guarded example app](../v0.1-build/issues/04-guarded-example-app.md) (build ticket 04, chosen in the build, awaiting R's review): apps get core's public origin as `ROBKIT_CORE_URL` rather than reading it from the request. `/refresh` always returns to the app, and the app's guard decides about login. Requests that aren't page loads get 401 JSON instead of a redirect.
- [Guests sign in with codes](../v0.1-build/issues/05-guests-sign-in-with-codes.md) (build ticket 05, R, 2026-11-01): core stores access codes as plain text, so admin can show a code and its intro link at any time. A code may have an expiry, and an expired code ends its sessions at the next refresh, as a revoked one does. Chosen in the build, awaiting R's review: a guest's token names the code's id rather than the code, and admin is a Hono server guarded as owner-only, so a guest gets a real 404.
- [Roles gate apps](../v0.1-build/issues/06-roles-gate-apps.md) (build ticket 06, R, 2026-11-01): core holds each app's access rule in its app catalog and serves it at `GET /apps/<slug>/access`, and adapters cache it for 60 seconds. The dev runner hands core the app list as `ROBKIT_APPS`, and core adds a new app as owner-only without overwriting the owner's edits. The CI journey re-gates the example app and waits out the cache rather than adding a second app. Chosen in the build, awaiting R's review: a guest's token carries role ids, core reissues it as soon as their roles change, each app learns its slug from `ROBKIT_APP`, and an open launcher asks core again every 30 seconds.
- [TanStack Start passes the same checks](../v0.1-build/issues/07-tanstack-start-adapter.md) (build ticket 07, chosen in the build, awaiting R's review): both adapters run one `requestGuard` from `@robkit/session` on web-standard requests. The Start adapter wraps the app's server entry rather than sitting in `src/start.ts`, which Start also loads in the browser, and hands routes and server functions the viewer as request context. The guard marks its 401 with a `Robkit-Session` header, and `@robkit/react`'s `sessionFetch` acts only on that, navigating once and coming back to the current page. App slugs can't contain hyphens, since each slug is a Postgres role, so the Start example is `start`.
- [The generator writes the default install](../v0.1-build/issues/08-generator-writes-default-install.md) (build ticket 08, chosen in the build, awaiting R's review): the hand-built apps became template layers in `packages/create-robkit`, merged in memory with manifests deep-merged. The generator writes an install's catalog from robkit's own, and `--link` points `@robkit/*` at a checkout through pnpm overrides. An install has one root ESLint config, its unit tests ship before Vitest becomes a choice, and the whole-stack test runs on generated installs.

## Not yet specified

- How a generated app's Dockerfile and env plug into R's Coolify setup (settled by build ticket 11).
- Naming and publishing: the npm scope (`@robkit/*`), the CLI name, licence, versioning and release flow.
- The robkit.dev website and its docs, including the later deployment cookbook.
- Backups, observability and secret rotation for a running install.

## Out of scope

- [Who may sign in through OIDC, and with what access?](issues/15-oidc-signup-policy.md): OIDC and email/password are scrapped for v0.1. Adding another login method later means rethinking the access layer.

- Next.js, Express and Go templates. They follow once v0.1 proves the adapter seam.
- Alternative deploy targets (plain VPS over SSH, home servers, Railway/Fly/Render). These may become a deployment cookbook on the website once the kit is solid.
