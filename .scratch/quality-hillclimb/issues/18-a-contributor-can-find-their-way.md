# 18: A contributor can find their way without help

**What to build:** Someone who has never seen robkit can find what each check does, how to propose a change without a ticket, how to fix the failures they will meet, and how to change a template.

Today:
- `tooling/eslint` and `tooling/repo-checks` have no READMEs, so a contributor whose commit a rule refuses has to read the rule's source.
- `CONTRIBUTING.md` assumes a ticket exists, and the PR check requires one.
- Nothing helps with the common failures: the pnpm shim on Windows, Docker's credential helper and `ERR_NETWORK_CHANGED`.
- `CONTRIBUTING.md`'s worked example doesn't keep `readRoleIds`' brands.
- There's no walkthrough for changing a template.

Raises rubric category 10 (nice to work in as a human), and 9 (keeping standards up). Evidence: `../research/council-r2-sonnet.md` section 10; `../research/council-r2-opus.md` section 10; `../research/council-r2-sol.md` section 10.

- **`tooling/eslint/README.md`.** List each rule with its message and what to do about it, and how to add a row to `package-graph.js` and `layers.js`.
- **`tooling/repo-checks/README.md`.** A table of each check: what it fails on, how to fix it, and how to add an exception. Link both READMEs from `CONTRIBUTING.md`.
- **"Without a ticket" in `CONTRIBUTING.md`.** Say how an outside contributor proposes a change: open an issue, or add a `needs-triage` ticket under `.scratch/` in the same PR. Make `tooling/repo-checks/src/check-pr-ticket.ts` accept a new `needs-triage` ticket added in the PR, with tests.
- **A troubleshooting table in `CONTRIBUTING.md`.** Cover the failures above, plus any you hit while doing this ticket.
- **A template walkthrough in `packages/create-robkit/README.md`.** Say where the hub, admin and core-client sources live, how to try an edit in a generated install, and which no-Docker command checks it. Every example must compile under the doc-example check.
- **The worked example.** Fix `CONTRIBUTING.md`'s example so it keeps `readRoleIds`' brands and compiles.
- **Planning.** Point to `.scratch/` planning from one place in `CONTRIBUTING.md` and say which ticket status to pick up, so a contributor doesn't need `CLAUDE.md`.
- **Timing table.** Refresh `CONTRIBUTING.md`'s timing table from a measured cold `pnpm check` run, and say where you measured it.

You own `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `docs/` (except `docs/conventions/*`) and the package READMEs this round. Apply what tickets 13 and 17 list under their Comments if they are merged before you finish. Otherwise the coordinator applies them.

**Blocked by:** 13

**Status:** ready-for-agent

- [ ] The tooling READMEs list every rule and check, and CONTRIBUTING links them
- [ ] A PR may add its own `needs-triage` ticket, with tests
- [ ] CONTRIBUTING has troubleshooting, a planning pointer and a refreshed timing table
- [ ] create-robkit's README walks through a template change, and its examples compile
- [ ] The worked example keeps the brands and compiles
- [ ] The PR's CI `gate` job passes on GitHub
