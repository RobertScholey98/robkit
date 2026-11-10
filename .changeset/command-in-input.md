---
"@robkit/input": minor
"@robkit/dev": patch
---

`runCommand`, `CommandProblem` and `reportFaultsAt` move to a new `@robkit/input/command` entry, so a command can use them without the dev runner. `@robkit/dev/cli` still exports them.
