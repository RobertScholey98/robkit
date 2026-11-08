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

**Status:** done

- [x] The tooling READMEs list every rule and check, and CONTRIBUTING links them
- [x] A PR may add its own `needs-triage` ticket, with tests
- [x] CONTRIBUTING has troubleshooting, a planning pointer and a refreshed timing table
- [x] create-robkit's README walks through a template change, and its examples compile
- [x] The worked example keeps the brands and compiles
- [x] The PR's CI `gate` job passes on GitHub

## Comments

### What I chose

- **The PR ticket check already accepted a ticket the PR adds.** CI runs `check-pr-ticket.ts` on a checkout of the PR's head, so a new ticket file exists there. A new child-process test pins that: a `needs-triage` ticket written only in the PR passes. I didn't make the check stricter, such as requiring a new ticket to be `needs-triage`. A round-merge PR adds its own tickets with other statuses, and that would fail it. What changed is the failure message: a Ticket section that names no file now says "No ticket yet? Add one with **Status:** needs-triage in this pull request", and points to CONTRIBUTING's "Without a ticket". The PR template's comment says the same. Those tests went red first.
- **Planning stays in CONTRIBUTING.** Sonnet suggested a `docs/planning.md`. I kept one "Planning" section in CONTRIBUTING instead: `.scratch/`'s layout, the status table and "take the lowest-numbered `ready-for-agent` ticket whose blockers are `done`". It is one place, and a contributor already reads that file.
- **The worked example is now two whole programs**: a Vitest test that imports `readAccessRule`, and the whole fixed function, importing `readRoleIds` and `AccessRule` from `@robkit/guard`. It checks `roleIds.length`, the branded `RoleId[]`, not the raw array. Changing it to return `roles as string[]` fails the doc-example check with "CONTRIBUTING.md:203: Type 'string[]' is not assignable to type 'RoleId[]'", so the check really covers it.
- **The template walkthrough** is in create-robkit's "For contributors": a table of where the hub, admin, core-client, core's app and the example live; then make a linked install, change it there, check with `pnpm turbo run test --filter=@internal/hub-app --filter=@internal/admin-app --filter=@internal/core-client`, `pnpm lint` and `pnpm typecheck` (no Docker), copy the file back, update `generate.test.ts`'s digest snapshot with `-u`, and add a changeset. It has only `sh` fences, so the doc-example check has nothing to compile there. CONTRIBUTING points to it from a short "Change a template" section.
- **Troubleshooting** covers the three named failures, plus Node 20 in WSL, a test that times out only under load, the coverage ratchet, the commit-msg hook and the PR ticket check.
- **Timing.** `pnpm check --force` on this Windows 11 machine took 56, 56 and 91 seconds (the 91 while other tickets' builds ran), and warm runs 41 and 57. The table says "about a minute, cold or warm", and "about five and a half minutes" for `check:all` on CI, from run 42158416018 (5 min 25 s).
- I also added knip to the table's "What it runs" (both gates run it), and a CONTRIBUTING link to README's "Learn more".

### Proof

- `check-pr-ticket.test.ts`: 9 tests pass. The two tests of the new message failed before the change to `pr-ticket.ts`; the new-ticket test passed on the old code, as a pin.
- `doc-examples`, `glossary`, `check-pr-ticket` and `commit-subject` tests: 37 passed after the doc changes.
- `pnpm check` on Windows: 44 of 44 tasks passed in all six runs, the last on the final docs.
- The walkthrough, run for real: `pnpm create-install <scratch>/try-install --stack start` took 18 s. In it, the hub, admin and core-client tests passed (48, 32 and 11), `pnpm lint` and `pnpm typecheck` passed. A one-line edit to `templates/base/apps/hub/src/intro-link.ts` failed `generate.test.ts`'s two digest snapshots, as the README says.
- Corepack fix: `corepack enable --install-directory <folder> pnpm` wrote `pnpm`, `pnpm.CMD` and `pnpm.ps1`, and with that folder first on `PATH`, `pnpm --version` printed 11.28.9.
- Node 20 in WSL: pnpm 11.28.9 printed "This version of pnpm requires at least Node.js v22.13", then failed with "No such built-in module: node:sqlite".
- CI on PR #57: `check`, `pull-request` and `gate` passed at head 666f41f, https://github.com/RobertScholey98/robkit/actions/runs/42161546782. The `check` job took 6 min 2 s.

### Not verified

- The Docker credential helper row. A config with `"credsStore": "desktop.exe"` and `/mnt/c` off `PATH` still pulled `hello-world` in this WSL, so I couldn't reproduce the failure. The row repeats what CONTRIBUTING's WSL step 5 already said, and names the helper the usual error names.
- The original pnpm shim failure on Windows. This machine's `pnpm` now works without the shim. The row describes the Corepack fix I did verify.

### For the coordinator

- **Ticket 14** may change what `readRoleIds` and `readAccessRule` return (`InputProblem` instead of `undefined`). If so, update CONTRIBUTING's worked example (steps 3 and 4) to match; the doc-example check will fail until it does. `tooling/eslint/README.md`'s `one-problem-type` row names `@robkit/session/input`, which moves too.
- **Ticket 17** renames `bin.ts` and `robkit.ts`. create-robkit's README names `src/bin.ts` in its Example section; it needs the new name. The walkthrough names no entry files.
- **Ticket 19** adds a no-Docker task for the template tests. Then create-robkit's "Change a template" step 2 can name it, and CONTRIBUTING's timing table needs a fresh measurement.
- **repo-checks never caches.** `@internal/repo-checks#test:unit` misses turbo's cache on every run, even with nothing changed (two warm runs, both "cache miss"), so a warm `pnpm check` takes 41 to 57 seconds rather than a few. Its `inputs` include `$TURBO_ROOT$/tooling/**`; my guess, not checked, is that the coverage folders other tasks write in the same run change its hash. Worth a ticket: a fix would make the warm gate much faster.
