# robkit

robkit is a self-hosting kit. `npm create robkit` scaffolds an install, and `robkit add` adds apps with auth, a database schema and a subdomain built in.

- Domain terms are in `GLOSSARY.md`. Use them in code, tests, tickets and commits.
- The plan is `.scratch/kit/map.md`. Build tickets are in `.scratch/v0.1-build/issues/`, numbered in build order.
- The spec is the Claude Doc "robkit v0.1 spec" (https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5). Where a ticket and the spec disagree, the ticket is newer and wins.

## Commands

```sh
pnpm install                              # Node 24, pnpm 11
pnpm dev                                  # the install on http://hub.localhost:3000
pnpm turbo run lint typecheck test        # what CI runs; needs Docker
pnpm format                               # Prettier
pnpm --filter <package> test              # one package
```

## Layout

- The repo root is a hand-built install until build ticket 08 turns it into templates: `compose.yaml` runs Postgres, and `apps/` holds core and the hub. Each `apps/<slug>` gets the subdomain `<slug>.localhost`, and an app with a `migrate` script gets its own schema and role.
- `packages/` holds the published `@robkit/*` packages: `@robkit/core` and `@robkit/dev`, the `robkit-dev` runner and proxy behind `pnpm dev`.
- `tooling/` holds private workspace packages: the shared tsconfig, the shared ESLint config, repo checks that run as tests, a per-suite test Postgres and the whole-stack test.

## The layer rule

- `@robkit/session` and `@robkit/guard` import no framework, and the guard does no I/O.
- Adapters (`@robkit/hono`, `@robkit/start`, `@robkit/react`) import session and guard, never core. Code reaches core over HTTP only.
- Packages never import from apps or examples.

## Conventions

- Every external version lives in the catalog in `pnpm-workspace.yaml`, and manifests say `catalog:`. A test in `tooling/repo-checks` fails on any version pinned elsewhere. Peer dependencies are exempt.
- TypeScript stays on 6.0 until typescript-eslint supports 7.
- pnpm 11 refuses packages published in the last day. Pin an older version rather than adding an exemption.
- Relative imports use the `.ts` extension, so Node can run source files directly.
