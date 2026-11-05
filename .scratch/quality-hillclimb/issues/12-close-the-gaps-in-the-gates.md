# 12: Close the gaps in the gates

**What to build:** The written rules that round 1 left to memory get checks: runtime code can't import a test-only package, the glossary's "Avoid" words don't creep back, dependency versions don't silently age, and a pull request names a real ticket.

Raises rubric categories 9 (keeping standards up), 1 (module boundaries) and 4 (naming). Evidence: `../research/council-r1-sol.md` sections 1 and 9, `../research/council-r1-sonnet.md` sections 4 and 9, `../research/council-r1-opus.md` sections 1 and 9.

- The package graph (`tooling/repo-checks/src/graph-check.ts`) tells runtime source from tests and config, and allows a `devDependencies` edge only from test or config files. A negative test uses core's dependency on `@internal/test-postgres` from a runtime file.
- The `layer` ESLint rule's adapter rows and the package graph have one source, generated one from the other or both from one file, if that can be done without the dependency cycle ticket 04 found. If it can't, say why in Comments and keep the agreement test.
- A glossary check in `tooling/repo-checks`: it reads each term's "_Avoid_" words from `GLOSSARY.md` and fails on them in `packages/*/src`, `docs/`, `README.md` and `AGENTS.md`, with listed exceptions where a word is right in context (a third-party API's name, a quote). Fix what it finds.
- Renovate (or Dependabot) for the pnpm catalog and GitHub Actions versions, grouped and weekly, respecting pnpm 11's minimum release age and `AGENTS.md`'s TypeScript pin. Config only; R turns it on.
- The PR template's ticket line is checked in the `pull-request` CI job: it must name a file under `.scratch/` that exists.

List doc changes under Comments; ticket 07 owns the docs in this wave.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] A runtime file importing a dev-only workspace package fails the graph check
- [ ] The layer rule and the graph have one source, or Comments explain why not
- [ ] The glossary check fails on an Avoid word, and the repo passes it
- [ ] Renovate config exists and respects the release-age and TypeScript pins
- [ ] CI fails a PR whose ticket line doesn't name an existing ticket
- [ ] The full gate passes: `pnpm check:all`
