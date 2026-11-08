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

**Status:** done

- [x] A root README with a quickstart whose commands work from a fresh clone
- [x] CONTRIBUTING covers prerequisites (including WSL), both gates, one package's tests, a worked first change, and the commit and ticket workflow
- [x] Each of the eight packages has a README with an example, its exports and its layer rule
- [x] `docs/architecture.md` shows the request flow, the token flow and the package map
- [x] `docs/adr/` holds the settled decisions, each linked from the map
- [x] `AGENTS.md` is scannable and still states every fact it stated before
- [x] `SECURITY.md` and `LICENSE` exist
- [x] The gate passes: `pnpm turbo run lint typecheck` and `pnpm format:check`

## Comments

**What I chose**

- Twelve decision records in `docs/adr/`, each linking the ticket that made it, with an index in `docs/adr/README.md`. The map links each record at the top of "Decisions so far". `docs/agents/domain.md` no longer says there is no `docs/adr/`.
- The quickstart makes an install from a clone with `pnpm create-install`, because the packages aren't on npm yet. It says so, and says what `npm create robkit` will do once they are.
- CONTRIBUTING's worked first change is a made-up ticket: `readAccessRule` refusing a roles rule with no roles. I rehearsed it (the new case fails, the one-line fix passes) and reverted it, so its commands and output are real. R may want that change for real; it isn't in this PR.
- `AGENTS.md` keeps every fact. A script checked each clause of the old file against the new one; the only ones not found word for word are rewordings. One is deliberate: "every install gets one stack" became "the same tooling", since the glossary keeps "stack" for an app's framework.
- `AGENTS.md` and CONTRIBUTING describe `pnpm check` and `pnpm check:all` as ticket 04 builds them. They don't work until 04 lands. They link `docs/conventions/input.md` (02) and `docs/conventions/errors.md` (03), which are dangling links until those merge.
- `SECURITY.md` asks for reports through GitHub's private vulnerability reporting. It is off on the repo today (`gh api repos/RobertScholey98/robkit/private-vulnerability-reporting` says `enabled: false`). R needs to turn it on, or name another channel.
- `LICENSE` is MIT, copyright Robert Scholey. R to confirm.

**Proof**

- From a fresh `git clone` of this branch in WSL (Ubuntu 22.04, Node 24.22.2): `corepack enable` gave pnpm 11.28.9; `pnpm install`; `pnpm create-install ../docs01-install2 --stack start`; `pnpm dev` answered on core, the hub and admin. Claiming through core's `/setup` made the owner, who saw "Signed in as the owner" on the example; the code `test` signed in a guest, who got "Not found" there (the example is owner-only). `pnpm robkit add notes --stack react-hono --access open` and `pnpm robkit add diary --stack start --access roles --roles Family --icon 📝` wrote both apps; `pnpm robkit check` exited 0; after `pnpm dev` again the guest saw "Signed in as a guest" on both. `pnpm robkit vendor` packed the packages.
- CONTRIBUTING's test commands, in that clone: `pnpm --filter @robkit/guard test` (36 passed), `pnpm --filter @robkit/guard exec vitest run src/guard.test.ts` (36), `pnpm --filter @robkit/hono test -- -t "conformance"` (26), `pnpm --filter @robkit/session test` (121), `pnpm format:check`.
- Each package README's TypeScript examples were compiled in their package with `tsc`. Those for guard, session, hono, dev and create-robkit compile as written; those for start, react and core need a dependency only the install's app has (`@tanstack/react-start`, `@hono/node-server`), and are copies of the template files that the whole-stack test compiles.
- The gate on Windows: `pnpm format:check` and `pnpm turbo run lint typecheck` (33 tasks) pass.

**Not verified**

- `pnpm check` and `pnpm check:all` (ticket 04 builds them).
- The whole-stack and production tests, `E2E_SCREENSHOTS`, and `playwright install`: the round's brief says not to run `tooling/e2e` here. The coordinator's gate runs them.
- CONTRIBUTING's fresh-machine steps `wsl --install`, Docker Desktop's settings and the nvm install line. WSL here already had them.

**For later tickets**

- Ticket 04: `AGENTS.md` and CONTRIBUTING already name `pnpm check` (format check, lint, typecheck, tests with no Docker, under a minute) and `pnpm check:all` (what CI runs, about four minutes). If 04 lands with different contents or timings, fix the table in CONTRIBUTING's "Check your work".
- Tickets 02 to 05 list in their Comments what `AGENTS.md` or CONTRIBUTING should say. Whoever merges the round folds those in.
- Stopping `pnpm dev` with a signal to pnpm, outside a terminal, leaves `robkit-dev` and the apps running: pnpm runs the script in its own process group. Ctrl+C in a terminal is fine. A script that runs `pnpm dev` should signal `robkit-dev` itself.
- In WSL's Ubuntu 22.04, curl doesn't resolve `*.localhost` names; use `--connect-to ::127.0.0.1:3000`. Browsers do resolve them.
