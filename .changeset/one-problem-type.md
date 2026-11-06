---
"@robkit/session": patch
"@robkit/core": patch
"@robkit/dev": patch
"create-robkit": patch
---

A failed read has one type, `InputProblem`, checked one way, `isProblem`. `readSlug` now returns an `InputProblem` rather than its own `{ error: string }`.

An install's `host` and `origin` take a `Slug`, so a string nobody read, such as `bad/path`, can't become an address, and `GuardFault.app` is a `Slug`.
