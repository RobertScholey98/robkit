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

**Status:** ready-for-agent

- [ ] A generated install lints with robkit's real rules, and refuses the same sample violations
- [ ] The glossary check scans templates, with a fixture that fails
- [ ] core-client returns `InputProblem`, and `callCore` reports failed decodes by default
- [ ] The errors doc states the result-shape rule, and `RequestDecision` and `callCore` follow it
- [ ] The PR's CI `gate` job passes on GitHub
