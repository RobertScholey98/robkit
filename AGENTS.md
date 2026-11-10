# robkit

robkit is a self-hosting kit. `npm create robkit` makes an install, and `robkit add` adds apps with auth, a database schema and a subdomain built in.

- Domain terms are in `GLOSSARY.md`. Use them in code, tests, tickets and commits.
- The plan is `.scratch/kit/map.md`. The current tickets are in `.scratch/just-use-it/issues/`, numbered in build order, with their PRD in `.scratch/just-use-it/PRD.md`. The earlier v0.1 build tickets are in `.scratch/v0.1-build/issues/`.
- The spec is the Claude Doc "robkit v0.1 spec" (https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5). Where a ticket and the spec disagree, the ticket is newer and wins.

## Commands

```sh
pnpm install                              # Node 24, pnpm 11
pnpm create-install                       # asks for a folder and the example's stack, then makes and installs an install linked to this checkout; pnpm dev in it
pnpm check                                # the fast gate: format check, lint, typecheck and every test that needs no Docker
pnpm check:all                            # the full gate, what CI runs; needs Docker
pnpm turbo run lint typecheck test        # lint, typecheck and every test; needs Docker
pnpm format                               # Prettier
pnpm --filter <package> test              # one package, with its coverage thresholds
pnpm changeset                            # a change to a published package's src needs one; CI checks
pnpm --filter @internal/repo-checks api:update  # rewrite the API reports after an intended API change; commit them with it
pnpm --filter @internal/e2e test:production  # the default install in Docker over https; CI runs it on main, nightly and PRs labelled production
```

## Where things are

- `packages/` holds the published packages: `create-robkit` and `@robkit/*`. Each README says what the package is for, gives an example, and lists its exports and its layer rule. Where a package's code needs more explaining, its README ends with a "For contributors" section.
- `tooling/` holds private workspace packages: the shared tsconfig and ESLint config; repo checks that run as tests; a per-suite test Postgres; `@internal/test-session`, which signs session tokens, runs a fake core for the guard's and adapters' tests, and builds branded values for tests; and the whole-stack test.

## Docs

- `README.md`: what robkit is, and the quickstart.
- `CONTRIBUTING.md`: setting up (WSL on Windows), the gates, a worked first change, planning and proposing a change without a ticket, branches and commits, and troubleshooting.
- `tooling/eslint/README.md`: each lint rule and what to do about it, and how to add a layer rule row or a package graph edge.
- `tooling/repo-checks/README.md`: each repo check and CI script, what it fails on, how to fix it, and where its exceptions go.
- `docs/architecture.md`: the request flow, the token flow, the package map, and where each concern lives.
- `docs/testing.md`: tests that start Docker, the whole-stack test, the production test, and what each prints when it fails.
- `docs/adr/`: one short record per settled decision, each linking the ticket that made it.
- `docs/conventions/input.md`: how robkit reads a value from outside its own code.
- `docs/conventions/errors.md`: expected failures, unexpected faults, and what a boundary does with each.
- `packages/<name>/README.md`: each package's purpose, example, exports and layer rule, and for core, create-robkit, dev, guard and session, a "For contributors" section on its code. create-robkit's says how to change a template.
- `SECURITY.md`: reporting a vulnerability, and the trust model.

## The layer rule

`tooling/eslint` enforces each rule here, and its error names the rule. A new rule goes in with its lint rule, in the same commit.

- `@robkit/input`, `@robkit/session` and `@robkit/guard` import no framework, and the guard and input do no I/O.
- Adapters (`@robkit/hono`, `@robkit/express`, `@robkit/next`, `@robkit/start`, `@robkit/react`) import session and guard, never core. Code reaches core over HTTP only. The lint rule builds this row for every package the package graph keeps off core, not just the adapters.
- Core's tables live in the `core` schema, declared with `core.table()` in `packages/core/src/schema.ts`.
- An install has its own layer rule, for its apps and shared packages. `robkit check` (`src/check.ts` in create-robkit, one row per rule) is its only implementation. The install's `lint` script runs it, then ESLint.
- Only the proxy may reach core, because core trusts `X-Forwarded-For` for its sign-in limit, or `CF-Connecting-IP` when `ROBKIT_TRUSTED_PROXY=cloudflare` says only a Cloudflare tunnel reaches the host. Core listens on 127.0.0.1 unless `HOST` is set.

## Conventions

- Read a value from outside robkit's own code as `docs/conventions/input.md` says, and handle failures as `docs/conventions/errors.md` says. In short: expected failures are values, faults throw with `cause`, a fixable command-line failure is a `CommandProblem` from `@robkit/input/command` (`runCommand` prints it without a stack), and every outbound request has a timeout. ESLint's `preserve-caught-error` and `robkit/no-silent-catch` enforce the `catch` part, and `robkit/no-bare-error` fails a thrown `Error` whose message is fixed text with no `cause`, outside tests.
- In this workspace the published packages' exports point at `src`. Each also builds to `dist` with `tsconfig.build.json`, and `publishConfig` points the packed package there, because Node won't strip types under `node_modules`. A repo check packs each one and fails on an export that isn't JS.
- A relative import never leaves its workspace; import the package by name. ESLint's layer rule and the graph check both fail one.
- `tooling/eslint/package-graph.js` lists which workspace package may depend on which. A new edge goes there in the same commit as the `package.json` change, and a repo check fails on an edge or import it doesn't list, or on a cycle. A published package's runtime code may import only its `dependencies` edges; `devDependencies` edges are for tests, `src/test` helpers and config. A new published package gets an entry there and an `api-report.md`.
- Every `ts` or `tsx` fence in the docs compiles against the built packages; a repo check (`tooling/repo-checks/src/doc-examples.ts`) fails on one that doesn't. Mark a fence that is deliberately not a whole program, such as a signature or a fragment, ` ```ts nocheck `.
- A package whose tests need no Docker defines `test:unit` as well as `test`, so `pnpm check` runs them. A test file that needs Postgres is named `*.db.test.ts`, and core and dev run those in a `db` Vitest project, apart from `test:unit`. `tooling/repo-checks/src/package-scripts.ts` checks every package's scripts and lists its exceptions.
- Each package with tests sets coverage thresholds in its `vitest.config`. Set them to what CI measures, rounded down. CI fails a pull request that lowers one, and `check-coverage-ratchet.ts` fails one more than 2 points under CI's measurement and names the number to set. e2e has none.
- Words `GLOSSARY.md` says to avoid fail a repo check (`tooling/repo-checks/src/glossary.ts`). Where one is right in context, add an exception there with the reason.
- Every `eslint-disable` gives its reason after `--`, and lint fails on one that disables nothing.
- A cast fails lint outside tests (`no-unsafe-type-assertion`, and `robkit/no-json-cast` for `JSON.parse` and `.json()`). Use a reader or a type guard instead.
- A cast to a branded type fails lint everywhere, tests included (`robkit/no-brand-cast`). Tests build a `Slug`, `CodeId`, `RoleId` or `Viewer` with `slug`, `aCodeId`, `aRoleId` and `aViewer` from `@internal/test-session`.
- A failed read is an `InputProblem`, checked with `isProblem`. `robkit/one-problem-type` refuses a `{ error: string }` of your own, `"error" in`, and, outside tests, `throw new Error(x.error)`: use `CommandProblem`, `orExit` or `orThrow`.
- An adapter-facing package (guard, session, hono, start, react) keeps a `*.test-d.ts` file saying what must and mustn't compile, and its `test` script runs `vitest run --typecheck`.
- The pre-commit hook runs ESLint's fixes and Prettier on staged files. The commit-msg hook, and CI on each commit of a pull request, check the subject with `tooling/repo-checks/src/check-commit-subjects.ts`.
- A change to a published package's `src`, or to create-robkit's `templates`, tests aside, needs a changeset (`pnpm changeset`). CI's `gate` job is the one required check, and a pull request fills in `.github/pull_request_template.md`. Its Ticket section must name the ticket's file under `.scratch/`; CI checks it. A pull request may add its own `needs-triage` ticket and name that.
- Every external version lives in the catalog in `pnpm-workspace.yaml`, and manifests say `catalog:`. A test in `tooling/repo-checks` fails on any version pinned elsewhere. Peer dependencies are exempt.
- Renovate proposes version updates weekly once it is installed (`renovate.json`). Its TypeScript cap moves with the catalog's.
- TypeScript stays on 6.0 until typescript-eslint supports 7.
- pnpm 11 refuses packages published in the last day. Pin an older version rather than adding an exemption. An install exempts only robkit's own packages, and `SECURITY.md` says why.
- Relative imports use the `.ts` extension, so Node can run source files directly. ESLint enforces it.
