# 21: Template code follows the repo's own rules

**What to build:** The code robkit generates into an install meets the same rules as robkit's own packages: the same lint rules, the same glossary, the same reader and result shapes.

Today none of that holds:
- `templates/base/eslint.config.js` copies a few of robkit's rules as `no-restricted-syntax` selectors and misses `no-silent-catch`, `no-bare-error`, `preserve-caught-error` and the comment rules.
- The glossary check doesn't scan templates.
- The template package `core-client` has its own `Reader<T>` that returns `undefined`, and `callCore` reports nothing by default.
- `RequestDecision` and `callCore`'s result are untagged unions, while the convention doc never says what a non-reader result looks like.
- The hub's `App.tsx` and admin's `main.tsx` throw fixed sentences.

Raises rubric categories 6 (consistency), 7 (error handling) and 9 (keeping standards up). Evidence: `../research/council-r3-opus.md` sections 6, 7 and 9; `../research/council-r3-sol.md` sections 4, 5, 6 and 9.

- **One lint policy.** robkit's rule files reach an install, vendored at generation time as `vendor.ts` does for packages, or as a small published config. The install's `eslint.config.js` uses the real rules instead of selectors. Keep `robkit check` for the install's own layer rule. Generator tests show a generated install refuses the same sample violations robkit does.
- **Glossary.** `tooling/repo-checks/src/glossary.ts` scans the templates' source, with narrow exceptions. A fixture proves a template word on the Avoid list fails.
- **core-client.** It reads with `@robkit/input`'s readers and returns `InputProblem`, keeping one browser transport result. `callCore` gets a default reporter that logs a failed decode with method, path and status, never credentials or bodies. Test the default.
- **Result shapes.** `docs/conventions/errors.md` (you own it this round) says a reader returns `T | InputProblem`, and any other union of outcomes is tagged with `outcome`. Change `RequestDecision` in `packages/session/src/request-guard.ts` and the adapters that switch on it, and `callCore`'s result, to match.
- **Fix what the rules find in the templates,** starting with the hub's `App.tsx` (say "Can't reach core. Check that `pnpm dev` is running." and report the cause) and admin's `main.tsx`.
- Add changesets, including one for the template change.

**Blocked by:** none

**Status:** done

- [x] A generated install lints with robkit's real rules, and refuses the same sample violations
- [x] The glossary check scans templates, with a fixture that fails
- [x] core-client returns `InputProblem`, and `callCore` reports failed decodes by default
- [x] The errors doc states the result-shape rule, and `RequestDecision` and `callCore` follow it
- [x] The PR's CI `gate` job passes on GitHub

## Comments

### What I chose, and why

- **Lint policy: copied at generation time, not a published config.** `tooling/eslint/policy.js` now holds every rule that doesn't know robkit's packages; `index.js` adds `layer` and `core-schema` on top. `readRobkitRepo` reads `policy.js` and follows its `./x.js` imports, and `generateInstall` writes those files to the install's `tooling/eslint/`. That folder has no `package.json`, so it isn't a workspace package: the root `eslint.config.js` imports `./tooling/eslint/policy.js`, and the root manifest takes the policy's packages (it gained `@eslint-community/eslint-plugin-eslint-comments`). This keeps the Dockerfile's `turbo prune` unaffected and needs no new published package. Generation already reads robkit's catalog from the checkout, so it adds no new dependency on the checkout.
- **Rule messages work in both places.** "See docs/conventions/…" became "See robkit's docs/conventions/…", and `no-brand-cast` no longer names `@internal/test-session`.
- **install-lint.test.ts** writes the generated `eslint.config.js` and `tooling/` to a temp folder, links the policy's five packages from robkit's `tooling/eslint` by their real paths (pnpm's own links are relative), and lints seven samples with the install's config and with robkit's. Both must fail on exactly the listed rules.
- **Result tags.** `RequestDecision` is `{ outcome: "serve", viewer } | { outcome: "answer", response }`, as council suggested. `callCore` answers `{ outcome: "ok", value } | { outcome: "failed", error }`. The errors doc's new rule also covered create-robkit's private `CoolifyAnswer`, so it's tagged `answered`/`failed` too. `deployOne`'s `{ ok: boolean; detail }` isn't a union, so it stays.
- **core-client problems.** Ticket 26 makes `InputProblem` nominal with a `problem()` helper. Until then core-client exports its own `problem(error)`, and every template reader makes problems only through it, so the switch is one line. Reader problems name the field, never the value, because `callCore` logs them.
- **Default report.** core-client has its own `Report` and `reportToConsole` of session's shape, since the browser bundle doesn't take `@robkit/session`. `callCore` no longer passes `JSON.parse`'s `SyntaxError` as a cause, because its message quotes the body. A non-JSON answer's report now names the status.
- **The hub's App.tsx.** The catch fires when the hub isn't on `hub.<domain>`. It reports the cause to the console and shows "Can't reach core. Check that `pnpm dev` is running, and open the hub at the address it prints." The ticket's sentence plus the second clause, since the real cause here is the address.
- **Glossary exceptions** are scoped to files: Vite's `plugin` in `vite.config.ts`, Compose's `services:`, Docker's `USER node`, shadcn's `group` classes in `packages/ui/src/components/ui`, Hono's `middleware` in the react-hono stack, and the existing `service token` exception now also covers the install's `docs/deploy.md`. drizzle-kit's migrations are skipped as generated.

### Proof

- `pnpm check` on Windows: 48 of 48 tasks pass, including `install-lint.test.ts` (7 tests) and `install-checks.test.ts` (a linked install's lint and its hub, admin and core-client tests).
- Red first: the `RequestDecision` type and runtime tests; 6 of 7 install-lint samples on the old template config (the old config already failed the dropped-cause sample, through ESLint's recommended `preserve-caught-error`); the glossary fixture; 9 core-client tests against the old `call-core.ts`.
- A scratch linked install ran `pnpm typecheck`, `pnpm test`, `pnpm lint` and `pnpm format:check`, all passing.
- I probed that `robkit/layer` still fires through `config()` after the split.
- CI: the `gate`, `check` and `pull-request` jobs passed on 58386b3, https://github.com/RobertScholey98/robkit/actions/runs/42192778450. `production` was skipped, as it is on unlabelled pull requests.

### Not verified

- The Docker-backed suites and the production e2e ran only on CI, not locally.
- No component test covers the hub's `App.tsx` change. Ticket 23 adds component tests for the hub and admin.

### For other tickets

- **Ticket 26:** after `problem()` lands in `@robkit/input`, make core-client's `problem` in `templates/base/packages/core-client/src/call-core.ts` call it (or re-export it). Structural `{ error }` literals stop type-checking there. Core-client's `Report` and `reportToConsole` copy session's `report.ts`; if 26 moves `report.ts` somewhere the browser can load, core-client can import it.
- **Ticket 22:** the template digest snapshot in `generate.test.ts` changed in several commits here; it now lists the eight `tooling/eslint/*.js` files an install gets.
- **Ticket 25 (docs):**
  - `docs/architecture.md:55-59`: the sequence diagram's `{ viewer }` and `{ response }` are now `{ outcome: "serve", viewer }` and `{ outcome: "answer", response }`.
  - `tooling/repo-checks/README.md:25`: the glossary row should say it also scans create-robkit's templates.
  - `AGENTS.md`, Conventions: say an install lints with robkit's policy, copied from `tooling/eslint/policy.js`, and that a reader returns `T | InputProblem` while any other union of outcomes is tagged with `outcome`.
  - `packages/create-robkit/README.md`'s "how to change a template": a generated install's `tooling/eslint` comes from robkit's `tooling/eslint`, not from `templates/`.
  - I updated `packages/session/README.md`'s example and export row myself, because its `ts` fence must compile.
