# 25: A first change in ten minutes

**What to build:** A newcomer can make and check a first change quickly. They can see what a generated install looks like without making one, and they get a clear message when a prerequisite is missing.

Today:
- Three tooling packages have no README: `tooling/test-session`, `tooling/test-postgres` and `tooling/e2e`.
- `pnpm check` prints every task's full output, even when everything passes.
- Nothing shows a generated install's tree.
- `robkit-dev` fails deep inside when Node, pnpm or Docker is missing or the wrong version.
- There's no command that keeps a linked preview install for template work.

Raises rubric category 10 (nice to work in as a human). Evidence: `../research/council-r3-opus.md` section 10; `../research/council-r3-sonnet.md` section 10; `../research/council-r3-sol.md` section 10.

- **Tooling READMEs.**
  - `tooling/test-session/README.md`: each builder, the fake core, and an example test.
  - `tooling/test-postgres/README.md`: how a suite gets its Postgres, and how to debug one that won't start.
  - `tooling/e2e/README.md`: the journeys and their files, pointing to `docs/testing.md`.
- **"Make your first change"** near the top of `README.md` or `CONTRIBUTING.md`. Point at one small worked file and its test, give the three commands to run, and show the output to expect.
- **A quiet `pnpm check`.** Print errors only by default, for example `--output-logs=errors-only`, so a failure says which package to rerun. Keep a way to see full logs, and document it.
- **`docs/tour.md`.** Show a generated install's tree, and say what each folder is for and which robkit package it uses.
- **Prerequisite checks.** Before `robkit-dev` starts anything, it checks the Node and pnpm versions and that Docker is reachable. Each failure is a `CommandProblem` that says what to install or start. Test each failure.
- **A template preview loop.** A root script keeps one linked preview install up to date for template work, without reinstalling on every check. Document it, including the hard-link restart behaviour, in `CONTRIBUTING.md` and create-robkit's README.
- **Docs.** You own `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `docs/` except `docs/conventions/*`, and every README this round. Apply the doc edits that tickets 21, 22, 24 and 26 list under their Comments. Measure `pnpm check`'s timing table again.

**Blocked by:** 21, 22, 24, 26

**Status:** ready-for-agent

- [ ] test-session, test-postgres and e2e have READMEs
- [ ] A first-change section, a quiet `pnpm check` and `docs/tour.md` exist
- [ ] `robkit-dev` checks its prerequisites first, with a test for each failure
- [ ] A template preview loop exists and is documented
- [ ] The other tickets' doc edits are applied, and the timing table is measured again
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### From the round 4 integration

- `docs/conventions/errors.md`: an install's core-client no longer has its own `Report`. It and the hub take `Report` and `reportToConsole` from `@robkit/input/report`. Line 81's "core-client's `reportToConsole`" and line 102's last sentence ("so it has its own `Report` and `reportToConsole` of the same shape") are out of date. This ticket's scope leaves out `docs/conventions/*`, but ticket 26's list of doc edits names that file too, so take it with them.
- `packages/create-robkit/README.md`: `generate.test.ts` also checks that an install's `tooling/eslint` is robkit's `policy.js` and what it imports, copied whole.
- `tooling/repo-checks/README.md`, tests table: add `runtime-dependencies.test.ts`. Fails when a template's server imports a package its `package.json` doesn't list under `dependencies`, which a production image leaves out. It starts at each `node` command in the `start` script and follows relative imports and workspace packages. Fix: move the package to `dependencies`. The template's `AGENTS.md`, "Production", can say this check enforces its rule.
