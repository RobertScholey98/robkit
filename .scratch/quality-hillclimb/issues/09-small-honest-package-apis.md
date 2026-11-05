# 09: Small, honest package APIs

**What to build:** Each package exports what its users import and no more, from entry points named after what they hold, and each name says what the thing is. Today `@robkit/session` exports 58 declarations across five concerns (tokens, the request guard, addresses, input readers and the manifest format), `@robkit/dev`'s root mixes the dev runner's internals with the command-line helpers create-robkit imports, and core leaks Drizzle's type through `Database`.

Raises rubric categories 2 (public API), 1 (module boundaries) and 4 (naming). Evidence: `../research/council-r1-opus.md` sections 1, 2 and 4, `../research/council-r1-sol.md` sections 1, 2 and 4, `../research/council-r1-sonnet.md` sections 2 and 4.

- `@robkit/session/input` keeps the generic readers (`InputProblem`, `isProblem`, `isRecord`, `parseJson`, `allProblems` and the single-variable readers). The manifest format (`readDeclares`, `declaresJson`, `readDeclaredApp`, `DeclaredApp`, `Declares`, `DeclaredAccess`) moves to `@robkit/session/manifest`, and `Declares` becomes `AppDeclaration`. Named config bundles with one consumer (`readServeEnv`, `readDevServerEnv`, `readGuardEnv`) move beside it, or to their consumer, whichever leaves fewer exports.
- `@robkit/dev/cli` holds the command-line helpers (`runCommand`, `reportFaultsAt`, and `Problem`, renamed `CommandProblem` beside `InputProblem`), and `exec`. The root entry shrinks to what installs and create-robkit import; the `robkit-dev` bin imports the runner's parts directly. Fold `provisionDatabase` into `provisionDatabases`. create-robkit's own `files.ts` and `set-up.ts` `run` go, in favour of dev's `isMissing` and `exec`.
- core's `Database` is a named type of its own, so the API report stops printing `PostgresJsDatabase`.
- Renames: core's display types in `sessions.ts` (`Viewer`, `OwnerViewer`, `GuestViewer`) clash with the guard's; call them `Profile`, `OwnerProfile` and `GuestProfile`, and add Profile to `GLOSSARY.md`. `packages/core/src/session-token.ts` becomes `mint-token.ts`. In `deployment.ts`, `Value` and `Deployment` become `DeploymentValue` and `AppDeployment`.
- Update `package-graph.ts`, the API reports, the package READMEs, the templates and `AGENTS.md` with each move; this ticket runs after the first wave, so it owns those files then. Add a changeset.

**Blocked by:** 06, 07, 08, 10, 12

**Status:** ready-for-agent

- [ ] session's entries each hold one concern, and `Declares` is `AppDeclaration`
- [ ] `@robkit/dev/cli` holds `runCommand`, `CommandProblem`, `reportFaultsAt` and `exec`; the root entry holds only what users import
- [ ] create-robkit uses dev's `exec` and `isMissing`; its copies are gone
- [ ] `Database` is core's own type
- [ ] The renames are done, and the glossary has Profile
- [ ] API reports, READMEs and AGENTS match
- [ ] The full gate passes: `pnpm check:all`
