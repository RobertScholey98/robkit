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

**Status:** done

- [x] A runtime file importing a dev-only workspace package fails the graph check
- [x] The layer rule and the graph have one source, or Comments explain why not
- [x] The glossary check fails on an Avoid word, and the repo passes it
- [x] Renovate config exists and respects the release-age and TypeScript pins
- [x] CI fails a PR whose ticket line doesn't name an existing ticket
- [ ] The full gate passes: `pnpm check:all`

## Comments

### What I chose

- **Runtime or test.** A file is runtime code when its package is published (not `private`) and the file is under `src/` and isn't a test (`*.test.*`, `*.test-d.ts`), a helper under a `test/` folder or a snapshot. Config beside `src` (`vitest.config.ts`, `drizzle.config.ts`) counts as config. A private package has no runtime code, so `@internal/test-session` may still import `@robkit/guard` from its `src`.
- **One source for the layer rule and the graph.** The graph moved from `tooling/repo-checks/src/package-graph.ts` to `tooling/eslint/package-graph.js`, exported as `@internal/eslint-config/package-graph`. repo-checks already depends on the ESLint config, so this adds no cycle. The layer rule now builds its core rows from the graph: every package the graph doesn't let take `@robkit/core` gets a row, "Layer rule: <package> never imports @robkit/core. Code reaches core over HTTP only." That covers the three adapters as before, and now session, guard, dev, create-robkit and the private tooling too, which the graph already kept off core. The agreement test stays, for any hand-written row that names a workspace package.
- **Glossary check.** `tooling/repo-checks/src/glossary.ts` reads each `_Avoid_` word from `GLOSSARY.md` and fails on it, whole-word and in any case, in `packages/*/src`, `packages/*/README.md`, `docs/`, `README.md` and `AGENTS.md`. I added the package READMEs because ticket 07 moves most of `AGENTS.md` into them. It skips snapshots. Hyphens count as part of a word, so `cancelled-by-user` and `radio-group` pass. Exceptions come in two kinds:
  - Words with a second meaning robkit uses, excepted everywhere: admin (also the platform app), cookie (HTTP cookies), password (the owner's, Postgres roles'), config, project (Compose, Coolify) and deployment (Coolify).
  - Lines where a word is right: another tool's word (Postgres URLs and GRANT, Unix process groups, Hono's and Start's middleware, Cloudflare's service token, BuildKit's cache backend), the layer rule's "no framework", core and the hub described in the glossary's own words ("the Hono backend"), and quotes (ticket titles, ADR 0006's history of grants, `docs/agents/domain.md` naming the words to avoid).
  - An exception that no longer matches a line fails the check, so a fixed or moved line takes its exception with it.
- **Fixed in source.** The guard called a guest holding one of the rule's roles a "member". It's an internal name, now `guest-in-rule`, with a patch changeset for `@robkit/guard`. Nothing else in `packages/*/src` needed a fix.
- **Renovate.** `renovate.json`: weekly (before 6am Monday, London), npm and Node minor and patch versions in one pull request, GitHub Actions (robkit's and the install template's) in another, majors one each. `minimumReleaseAge` is "1 day", matching pnpm 11's default, with `internalChecksFilter: strict`. TypeScript is capped at `<6.1.0`, since the catalog comment says typescript-eslint supports below 6.1. `renovate.test.ts` reads both pins from `pnpm-workspace.yaml` and fails if the config stops keeping to them. R turns Renovate on by installing the app.
- **PR ticket check.** `check-pr-ticket.ts` runs in the `pull-request` job. It fails unless the body's `## Ticket` section names a file under `.scratch/` that exists on the branch. It ignores HTML comments, so the template's example path never counts. It fetches the body with `gh pr view` when it runs rather than reading the event, so re-running the job after editing the body works. The job gets `pull-requests: read` for that. Pull requests from bots (Renovate) skip it.

### Proof

- Graph: `import "@internal/test-postgres"` added to `packages/core/src/apps.ts` failed the workspace test with `packages/core/src/apps.ts:223 imports @internal/test-postgres, which tooling/repo-checks/src/package-graph.ts lets @robkit/core take only in tests and config` (before the move renamed the path). Unit tests cover core's case, tests, helpers, config and a private package.
- Layer rule: `layers.test.js` checks `coreRows` against a small graph, and that hono, start, react, session, dev and e2e are refused `@robkit/core` while repo-checks may take it.
- Glossary: "Hands the frontend a magic link." in `packages/react/src/index.ts` failed with `says "frontend" ... Say "Hub" instead` and `says "magic link" ... Say "Intro link" instead`. The repo passes.
- Renovate: `renovate-config-validator` (npx renovate, latest) said "Config validated successfully". The unit tests cover a short release age, a missing one and a loose TypeScript cap.
- PR ticket: `PR_BODY` with this ticket's path passed and printed it; the bare template failed with "names no file under .scratch/". Unit and CLI tests cover a missing section, a missing file and a path outside `.scratch/`.
- `pnpm check` on Windows: 42 of 42 tasks passed. Coverage thresholds raised: repo-checks to 84/74/89/86, eslint-config to 97/92/97/99.

### Not verified

- The Docker tests and `pnpm check:all`. I changed no code in core, dev, test-postgres or e2e; their lint, which the new core rows touch, passed in `pnpm check`. The full-gate criterion is left for the coordinator.
- The CI step itself runs only on GitHub. This PR is its first run.

### For the merge with the other tickets

- Ticket 07 moves `AGENTS.md` sections. If a line an exception names moves into a package README or `docs/testing.md` unchanged, the exception still matches (text exceptions apply in any scanned file unless they name one). If 07 rewords one, the check names the exception to delete or the new line to fix.
- Ticket 08 edits `graph-check.ts`'s `JSON.parse` cast. My edits there are in other functions.

### Doc changes for ticket 07 (and 08)

- `AGENTS.md` conventions: the package graph is now `tooling/eslint/package-graph.js`, not `tooling/repo-checks/src/package-graph.ts`. Add: an import in a published package's runtime code may use only its `dependencies` edges; `devDependencies` edges are for tests, `src/test` helpers and config.
- `AGENTS.md` layer rule: "Adapters ... never core" is now enforced for every package the graph keeps off core, and the row is built from the graph.
- `AGENTS.md` conventions: add "Words `GLOSSARY.md` says to avoid fail a repo check (`tooling/repo-checks/src/glossary.ts`); where one is right in context, add an exception there with the reason." And: "A pull request's Ticket section must name its ticket file under `.scratch/`; CI checks it." And: "Renovate proposes version updates weekly once installed; its TypeScript cap moves with the catalog's."
- Slips, each with a pending exception in `glossary.ts` to delete in the same commit:
  - `AGENTS.md:3` "`npm create robkit` scaffolds an install" → "makes an install" (exception for "scaffold").
  - `docs/adr/0008-packages-update-apps-are-owned.md:7` "an eject command splits users into two kinds" → "splits installs into two kinds" (exception for "user").
  - `docs/conventions/input.md:60` (ticket 08's) "what the user reads" → "what the owner reads" (exception for "user").
