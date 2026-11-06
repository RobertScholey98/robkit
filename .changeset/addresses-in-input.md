---
"@robkit/input": patch
"@robkit/session": patch
"@robkit/core": patch
"@robkit/dev": patch
"create-robkit": patch
---

An install's addresses move from `@robkit/session/addresses` to `@robkit/input/addresses`. Import `install`, `installAt`, `coreInstall`, `isLocal`, `defaultDomain`, `defaultDevPort`, `Install` and `InstallOptions` from there. The hub's and admin's templates import them from the new place.
