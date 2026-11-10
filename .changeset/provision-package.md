---
"@robkit/provision": minor
"@robkit/dev": minor
"create-robkit": patch
---

The provision step moves out of `@robkit/dev` into `@robkit/provision`: `provisionDatabases`, `provisionDatabase`, `databasePassword`, `databaseUrl` and `readProvisionConfig`. Core can run it without the dev runner. `provisionApps` stays in the dev runner. An install's `apps/core` takes the step from the new package.
