# robkit

robkit is a self-hosting kit. `npm create robkit` scaffolds an install, and `robkit add` adds apps with auth, a database schema and a subdomain built in.

- Domain terms are in `GLOSSARY.md`. Use them in code, tests, tickets and commits.
- The plan is `.scratch/kit/map.md`. Build tickets are in `.scratch/v0.1-build/issues/`, numbered in build order.
- The spec is the Claude Doc "robkit v0.1 spec" (https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5). Where a ticket and the spec disagree, the ticket is newer and wins.

## Commands

```sh
pnpm install                              # Node 24, pnpm 11
pnpm create-install                       # init's questions, then an install linked to this checkout; pnpm dev in it
pnpm turbo run lint typecheck test        # what CI runs; needs Docker
pnpm format                               # Prettier
pnpm --filter <package> test              # one package
```

## Layout

- `packages/create-robkit` is `npm create robkit`. With no flags it asks init's questions and ends by printing the flags that make the same install. Each choice is described once, in the table in `src/choices.ts`: its flag, question, options and labels, which options are coming later, and the template layer each option adds. The flag parser, the usage text, the wizard and the generator all read it, so a new option is one table entry plus its folder under `templates/`. Its `templates/` holds an install in layers: `base` (core, Compose, turbo), `package-managers/<name>`, `ui-kits/none` (the hub and admin without a kit), `tools/<name>`, and `stacks/<name>` for apps. The generator lays the chosen layers over each other in memory, merging manifests, mounts the first generator's stack at `apps/example`, writes the catalog from robkit's own, and records the choices in `robkit.json`. `init` in `src/init.ts` is the one operation from choices to a finished install: generate, write, then with `install` install dependencies and initialise git. The command line and the whole-stack test both call it. The templates are an install's own files: the install lints and tests them, so robkit's ESLint and TypeScript skip them.
- In an install, each `apps/<slug>` gets the subdomain `<slug>.robkit.localhost`, and an app with a `migrate` script gets its own schema and role from the provision step, `provisionApps` in `@robkit/dev`, which then runs that script. `pnpm dev` runs the step before it starts the apps. The dev runner tells each app its slug as `ROBKIT_APP`, and hands core the owner's apps as `ROBKIT_APPS`. Core adds new ones to its app catalog, where admin sets who may open each one.
- `packages/` holds the published `@robkit/*` packages:
  - `@robkit/core`, the backend.
  - `@robkit/session`, the session token's claims and cookie, `coreKeys`, which fetches core's public key once so apps verify tokens locally, `coreAccess`, which loads an app's access rule from core and keeps it for a minute, and `requestGuard`, which runs the guard on a web-standard `Request` for the server adapters.
  - `@robkit/guard`, the pure guard, and `conformance.json`, the cases the guard and every adapter pass.
  - `@robkit/hono`, the Hono adapter.
  - `@robkit/start`, the TanStack Start adapter. It wraps the app's server entry, so routes and server functions get the viewer as `context.viewer`.
  - `@robkit/react`, the client helper. Its `sessionFetch` sends the browser through core's `/refresh` when a call finds the session lapsed, and hands every other answer to the caller.
  - `@robkit/dev`, the `robkit-dev` runner and proxy behind an install's `pnpm dev`.
- `tooling/` holds private workspace packages: the shared tsconfig, the shared ESLint config, repo checks that run as tests, a per-suite test Postgres, `@internal/test-session`, which signs session tokens for the adapters' tests, and the whole-stack test. It generates installs linked to this checkout, runs each one's own checks, and takes a browser through each stack's example app in Chromium.

## The layer rule

`tooling/eslint` enforces each rule here, and its error names the rule. A new rule goes in with its lint rule, in the same commit.

- `@robkit/session` and `@robkit/guard` import no framework, and the guard does no I/O.
- Adapters (`@robkit/hono`, `@robkit/start`, `@robkit/react`) import session and guard, never core. Code reaches core over HTTP only.
- Core's tables live in the `core` schema, declared with `core.table()` in `packages/core/src/schema.ts`.
- In an install, only `apps/core` imports `@robkit/core`. The install's own `eslint.config.js` enforces it, from the `tools/eslint-prettier` layer.
- Only the proxy may reach core, because core trusts `X-Forwarded-For` for its sign-in limit. Core listens on 127.0.0.1 unless `HOST` is set.

## Conventions

- Every external version lives in the catalog in `pnpm-workspace.yaml`, and manifests say `catalog:`. A test in `tooling/repo-checks` fails on any version pinned elsewhere. Peer dependencies are exempt.
- TypeScript stays on 6.0 until typescript-eslint supports 7.
- pnpm 11 refuses packages published in the last day. Pin an older version rather than adding an exemption.
- Relative imports use the `.ts` extension, so Node can run source files directly. ESLint enforces it.
