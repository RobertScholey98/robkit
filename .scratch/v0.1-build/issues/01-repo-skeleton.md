# 01: Repo skeleton

**What to build:** robkit's own repository is ready to build in: a pnpm + Turborepo monorepo with `GLOSSARY.md` (the 20 terms in `kit/issues/03-domain-glossary.md`) and `AGENTS.md`, and CI that runs lint, typecheck and test on every PR. This is a prefactor: it demos nothing on its own, but every later ticket lands green on it.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `pnpm install --frozen-lockfile` and `pnpm turbo run lint typecheck test` pass on a clean clone
- [x] CI runs the same commands on pull requests and pushes to `main`
- [x] `GLOSSARY.md` holds the glossary ticket's terms, and `AGENTS.md` states robkit's own layer rule (below) and points at the spec
- [x] Every external version lives in one pnpm catalog

**robkit's own layer rule (draft, for R to react to):**

- `@robkit/session` and `@robkit/guard` import no framework, and the guard does no I/O.
- Adapters (`hono`, `start`, `react`) import session and guard, never core. Core is reached over HTTP only.
- Packages never import from apps or examples.

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5

## Comments

Notes from the build, for ticket 02 onwards:

- pnpm is pinned to 11, not 12. pnpm 12 ships as a native binary that Corepack 0.34 can't launch, and R's local pnpm runs through Corepack. CI installs pnpm with `pnpm/action-setup`, which has no such limit.
- TypeScript is pinned to 6.0.3, because typescript-eslint supports TypeScript below 6.1.
- pnpm 11 refuses packages published in the last day. Pin an older version instead of adding a `minimumReleaseAgeExclude` entry.
- Private workspace packages are named `@internal/*`, so the `@robkit` scope stays free for published packages.
- The workspace globs are `packages/*` and `tooling/*`. Add a glob in `pnpm-workspace.yaml` when ticket 02 creates the hand-built install's folders.
- `AGENTS.md` states robkit's layer rule, but nothing enforces it yet, because no package exists to break it. Add the check to `tooling/repo-checks` once session, guard and an adapter exist (ticket 04).
- `GLOSSARY.md` flags two words the plan uses in two senses, generator and layer. R to settle.
