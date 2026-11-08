---
"@robkit/guard": patch
"@robkit/session": patch
"@robkit/core": patch
"create-robkit": patch
---

`readAccessRule`, `readRoleId`, `readCodeId` and `readRoleIds` return an `InputProblem` that says what's wrong, rather than `undefined`, like every other reader. Check the result with `isProblem` from `@robkit/input`.
