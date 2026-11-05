---
"@robkit/core": patch
"@robkit/session": patch
"@robkit/guard": patch
"@robkit/hono": patch
"@robkit/start": patch
"@robkit/react": patch
"@robkit/dev": patch
"create-robkit": patch
---

Every file, environment variable and argument is read once, at its edge, by a reader in `@robkit/session/input` that returns the value or an `InputProblem` naming the file or variable, the key and the fix. A slug crosses package boundaries as a `Slug`, which only `readSlug` makes, so the guard's `app` and a token's audience must be one. `slugProblem` moved from `@robkit/dev` to `@robkit/session/addresses`.
