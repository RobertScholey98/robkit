---
"@robkit/input": patch
"@robkit/guard": patch
"@robkit/core": patch
"@robkit/dev": patch
"create-robkit": patch
---

`InputProblem` is nominal. Make one with `problem(message)` from `@robkit/input`; `isProblem` checks its mark, so an object that only has an `error` field, such as a JSON body, is no longer taken for a problem. The mark doesn't enumerate, so a problem still prints and serialises as `{ error }`.
