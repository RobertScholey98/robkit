---
"@robkit/session": patch
"@robkit/dev": patch
"@robkit/core": patch
"create-robkit": patch
---

Each package exports what its users import, from entry points named after what they hold.

- `@robkit/session/input` keeps the generic readers. The manifest format moves to `@robkit/session/manifest`, where `Declares` is now `AppDeclaration`, read by `readAppDeclaration` and written by `appDeclarationJson`. `readServeEnv`, `readDevServerEnv` and `readGuardEnv` move to `@robkit/session/app-env`.
- `@robkit/dev/cli` holds `runCommand`, `reportFaultsAt`, `exec`, `isMissing` and `CommandProblem`, which was `Problem`. On Windows, `exec` runs the command through the shell, so it can start pnpm. `@robkit/dev`'s root keeps the apps and the provision step; `provisionDatabase`, `provisionApps`, `runDev`, `createProxy`, `routesFor` and `readAppManifest` are no longer exported.
- `@robkit/core`'s `Database` is a type of its own rather than Drizzle's.
- create-robkit's `Value` and `Deployment` are now `DeploymentValue` and `AppDeployment`. An option a command doesn't take, such as `create-robkit --help`, prints what's wrong and the usage rather than a bug report.
