# 01: Repo skeleton

**What to build:** robkit's own repository is ready to build in: a pnpm + Turborepo monorepo with `GLOSSARY.md` (the 20 terms from the map's glossary ticket) and `AGENTS.md`, and CI that runs lint, typecheck and test on every PR. This is a prefactor: it demos nothing on its own, but every later ticket lands green on it.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `pnpm install --frozen-lockfile` and `pnpm turbo run lint typecheck test` pass on a clean clone
- [ ] CI runs the same commands on pull requests and pushes to `main`
- [ ] `GLOSSARY.md` holds the glossary from the spec, and `AGENTS.md` states the layer rule and points at the spec
- [ ] Every external version lives in one pnpm catalog

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
