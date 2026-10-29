# 01: Repo skeleton

**What to build:** robkit's own repository is ready to build in: a pnpm + Turborepo monorepo with `GLOSSARY.md` (the 20 terms in `kit/issues/03-domain-glossary.md`) and `AGENTS.md`, and CI that runs lint, typecheck and test on every PR. This is a prefactor: it demos nothing on its own, but every later ticket lands green on it.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `pnpm install --frozen-lockfile` and `pnpm turbo run lint typecheck test` pass on a clean clone
- [ ] CI runs the same commands on pull requests and pushes to `main`
- [ ] `GLOSSARY.md` holds the glossary ticket's terms, and `AGENTS.md` states robkit's own layer rule (below) and points at the spec
- [ ] Every external version lives in one pnpm catalog

**robkit's own layer rule (draft, for R to react to):**

- `@robkit/session` and `@robkit/guard` import no framework, and the guard does no I/O.
- Adapters (`hono`, `start`, `react`) import session and guard, never core. Core is reached over HTTP only.
- Packages never import from apps or examples.

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
