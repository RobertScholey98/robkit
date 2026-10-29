# Map: robkit v0.1

## Destination

A decided spec and ordered PR list for robkit v0.1. `npm create robkit` scaffolds a monorepo with the platform (Hono core, a React hub with access-code login, admin, shared Postgres). `robkit add` opens a selector of stack templates (v0.1: TanStack Start, and React with Hono) and drops in an app that already has auth, a database schema and a subdomain. All of it runs locally with one command. Deploys use R's existing Coolify method for now.

## Notes

- **Product:** painless self-hosting of small, often vibe-coded, apps for friends and family. Auth, database, routing and the launcher come built in. The templates are stacks, not R's apps.
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
- [What is robkit's domain glossary?](issues/03-domain-glossary.md): 20 terms in `GLOSSARY.md`; hub (login and launcher UI) and core (Hono backend) are distinct; one owner per install, set at init, everyone else a guest.
- [How should the init and add wizards flow?](issues/11-cli-flow.md): as in the clickable prototype; no domain prompt (`ROBKIT_DOMAIN` is runtime config, default `localhost`); init always adds an example app and a local-only all-access code `test`.
- [What does each template ship for coding agents?](issues/12-agent-instructions.md): root and per-app `AGENTS.md` (per stack and ORM), a one-line `CLAUDE.md` pointing at it, and lint rules that fail on layer or cross-app imports.
- [How does robkit test itself?](issues/13-kit-testing.md): generate real projects; pairwise set (~12) plus one end-to-end journey per stack on each PR, full 72-combination matrix nightly.
- [What does one-command local dev look like?](issues/10-local-dev.md): Postgres in Compose, every app native via `turbo dev`, and a robkit proxy on `:3000` routing `*.localhost` so URLs and cookies match production.
- [Assemble the v0.1 spec and PR list](issues/14-assemble-spec.md): the destination, written up as the robkit v0.1 spec doc (https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5) with 18 ordered PRs.

## Not yet specified

- How a generated app's Dockerfile and env plug into R's Coolify setup.
- Naming and publishing: the npm scope (`@robkit/*`), the CLI name, licence, versioning and release flow.
- The robkit.dev website and its docs, including the later deployment cookbook.
- Backups, observability and secret rotation for a running install.

## Out of scope

- [Who may sign in through OIDC, and with what access?](issues/15-oidc-signup-policy.md): OIDC and email/password are scrapped for v0.1. Adding another login method later means rethinking the access layer.

- Next.js, Express and Go templates. They follow once v0.1 proves the adapter seam.
- Alternative deploy targets (plain VPS over SSH, home servers, Railway/Fly/Render). These may become a deployment cookbook on the website once the kit is solid.
