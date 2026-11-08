# 27: Each folder about one thing, and one way to print

**What to build:** create-robkit's source is about making and changing an install, with deploying in a folder of its own. repo-checks has one module per artifact it guards. Every command prints through one function.

Today:
- Coolify's API, config and deploy code sit beside the scaffolder's files in `packages/create-robkit/src`.
- repo-checks has about 20 checks, several guarding the same artifact. Coverage alone has `check-coverage-thresholds.ts`, `check-coverage-ratchet.ts` and `coverage-thresholds.ts`, and commit subjects have two files.
- The commands mix `console.log` with injected output, and dev's `runner.ts` prints directly.
- A few plain throws remain, in `generate.ts` and the guard's `conformance.ts`.

Raises rubric categories 5 (simplicity) and 6 (consistency). Evidence: `../research/council-r3-opus.md` section 5; `../research/council-r3-sonnet.md` sections 5 and 6; `../research/council-r3-sol.md` section 5.

- **Deploy folder.** Move `coolify-api.ts`, `coolify-config.ts`, `coolify-deploy.ts` and `deployment.ts` into `packages/create-robkit/src/deploy/`, with one entry that `robkit-command.ts` imports.
  - Replace `Desired.settings` with an explicit interface.
  - Read Coolify's answers with typed readers built on `@robkit/input`'s pattern, not `unknown`-taking helpers.
  - Pin behaviour first: the Coolify tests pass unchanged apart from import paths.
- **Fewer repo-check modules.** Fold the coverage files into one `coverage.ts` with its command lines, and the two commit-subject files into one. Keep every check's behaviour and tests. The repo-checks README's table should then be shorter; list that edit for ticket 25.
- **One way to print.**
  - Every command in `robkit-command.ts` and `create-robkit-command.ts` takes a print function, as `coolify-deploy.ts` does.
  - dev's `runner.ts` uses the same output as dev's other commands.
  - Add a `no-console` lint row for `packages/*/src`, outside the command entry points and `report.ts`.
- **Remaining plain throws.** `generate.ts` and `conformance.ts` throw `CommandProblem` when the person can fix the problem. Otherwise they throw faults that name what failed and keep a cause.
- **Commits.** Moves and renames go in their own commits. Add changesets.

**Blocked by:** 22, 24, 26

**Status:** ready-for-agent

- [ ] Deploy code lives in `create-robkit/src/deploy/` behind one entry, with typed Coolify readers
- [ ] repo-checks has one module per guarded artifact, with the same tests passing
- [ ] Commands print through one function, and `no-console` holds outside entry points
- [ ] No plain throw is left in `generate.ts` or `conformance.ts`
- [ ] The PR's CI `gate` job passes on GitHub
