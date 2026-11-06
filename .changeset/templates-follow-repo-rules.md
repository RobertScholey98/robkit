---
"create-robkit": patch
---

An install's code follows the rules robkit's own code does.

- The hub's and admin's pages say which element they lack, and where it comes from, when they can't start.
- An install lints with robkit's own policy. create-robkit copies `tooling/eslint/policy.js` and the rules it imports into the install's `tooling/eslint`, and the install's `eslint.config.js` uses it, in place of selectors that copied three of the rules. So `no-silent-catch`, `no-bare-error`, `no-brand-cast`, `preserve-caught-error` and the suppression rules now apply to an install too.
- `callCore`'s result is tagged with `outcome`: `{ outcome: "ok", value }` or `{ outcome: "failed", error }`.
- core-client reads with `@robkit/input`. A reader returns the value or an `InputProblem` that names the field, `listOf` names the item, and core-client's own `isRecord` is gone. `callCore` reports through `reportToConsole` unless given a `report`: an answer it can't read with its method, path, status and the reader's problem, but never what core sent.
- The hub, when it isn't on `hub.<domain>`, says "Can't reach core. Check that `pnpm dev` is running" and reports why to the console, rather than showing the raw error.
