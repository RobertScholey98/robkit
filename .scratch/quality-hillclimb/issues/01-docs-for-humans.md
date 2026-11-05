# 01: Docs for humans

**What to build:** A person who has never seen robkit can learn what it is, make an install, and make a correct change on day one without asking anyone. Today the only docs are agent instructions: there is no root README, no package README, no CONTRIBUTING and no licence, `AGENTS.md`'s Layout section is one long paragraph, and settled decisions live in `.scratch` tickets and an external spec.

Raises rubric categories 10 (nice to work in), 2 (public API) and 4 (naming). See `../research/robkit-round-0.md` for the gaps the explorer found and `../research/tanstack-router.md` and `../research/t3code.md` for what scored well elsewhere (TanStack's CONTRIBUTING and local architecture notes, T3 Code's short dev runbook and glossary).

- `README.md` at the root, for someone deciding whether to use robkit: what it is in two sentences, a quickstart (make an install, `pnpm dev`, sign in, `robkit add` an app), a picture of an install (proxy, core, hub, admin, apps, Postgres), and links to the rest. Contributors get one short section pointing to CONTRIBUTING.
- `CONTRIBUTING.md`: prerequisites (Node 24, pnpm 11 through corepack, Docker; on Windows the full suite runs in WSL, with the exact steps), install, the fast gate `pnpm check` and the full gate `pnpm check:all` (ticket 04 builds both; document them by those names), running one package's tests, a worked first change from ticket to PR, how tickets, branches and commits work here (from `CLAUDE.md`, written for a human), and where to look when a test fails (`E2E_SCREENSHOTS`, the journey's failure output).
- A `README.md` in each of the eight packages under `packages/`: what it is for, who uses it, a minimal example taken from real use in the templates, its exports in a short table, and what it must never do (its layer rule).
- `docs/architecture.md`: how a request flows (browser, proxy, app, guard, core), how tokens flow (core's token, app tokens, refresh), the package map with the direction dependencies go, and where to look for each concern. Use Mermaid diagrams.
- `docs/adr/`: one short record for each settled decision a newcomer would otherwise question (about eight to twelve), each with context, decision and consequences, linking the ticket that made it. `.scratch/kit/map.md` links each record.
- `AGENTS.md` restructured so a reader can scan it: short sections and bullets instead of the long Layout paragraph. Keep every fact it states today. Link `docs/conventions/input.md` (ticket 02) and `docs/conventions/errors.md` (ticket 03), and the new docs.
- `SECURITY.md`: how to report a vulnerability, and the trust model in brief (only the proxy reaches core, per-app tokens, what an imported app can and can't do).
- `LICENSE`: MIT, copyright Robert Scholey. R to confirm.

This ticket is the only one in round 1 that edits `AGENTS.md`, `README.md` and `CONTRIBUTING.md`. Write in plain sentences, follow `.skills/unslop`, use the glossary's terms, and check every command you document by running it.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] A root README with a quickstart whose commands work from a fresh clone
- [ ] CONTRIBUTING covers prerequisites (including WSL), both gates, one package's tests, a worked first change, and the commit and ticket workflow
- [ ] Each of the eight packages has a README with an example, its exports and its layer rule
- [ ] `docs/architecture.md` shows the request flow, the token flow and the package map
- [ ] `docs/adr/` holds the settled decisions, each linked from the map
- [ ] `AGENTS.md` is scannable and still states every fact it stated before
- [ ] `SECURITY.md` and `LICENSE` exist
- [ ] The gate passes: `pnpm turbo run lint typecheck` and `pnpm format:check`
