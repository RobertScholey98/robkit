# @internal/eslint-config

The ESLint config every workspace package lints with, and robkit's own rules. A package's `eslint.config.js` calls `config(import.meta.dirname)` from here. The pre-commit hook runs ESLint's fixes on the files you stage, and both gates run `lint` in every package.

On top of ESLint's recommended rules and typescript-eslint's `strictTypeChecked` and `stylisticTypeChecked`, it turns on the rules below. Each message says what to do; this page says a little more.

## robkit's rules

| Rule                               | Its message                                                                                                                                                                                                                                                                                                                                                                                  | What to do                                                                                                                                                                                                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `robkit/layer`                     | Starts "Layer rule:" and names the rule, such as "Layer rule: @robkit/guard does no I/O."                                                                                                                                                                                                                                                                                                    | Don't import it there. Code reaches core over HTTP, the guard stays pure, and session and the guard import no framework. See [The layer rule](#the-layer-rule).                                                                                                                     |
| `robkit/layer`, relative import    | "Layer rule: this import reaches outside packages/guard with ../../input/src/problem.ts. Import the package by name."                                                                                                                                                                                                                                                                        | Import the other package by its name, such as `@robkit/input`. If the graph doesn't allow that edge, add one to `package-graph.js` first.                                                                                                                                           |
| `robkit/core-schema`               | "Core's tables live in the core schema. Declare them with core.table() from schema.ts."                                                                                                                                                                                                                                                                                                      | In `packages/core`, declare a table with `core.table()` from `src/schema.ts`. `pgTable`, and `pgSchema` with any name but `core`, fail.                                                                                                                                             |
| `robkit/no-bare-error`             | "This error's message is fixed text with no cause. Name what was tried, such as the table, key, file or attempt count, or pass the error underneath as { cause }."                                                                                                                                                                                                                           | Put what was tried in the message, such as `` `Core couldn't store a session for ${profile.id}.` ``, or pass the caught error as `cause`. A `CommandProblem`, another error class, or an `Error` built from a variable passes. Tests and `test/` helpers may throw a fixed `Error`. |
| `robkit/no-brand-cast`             | "Only a reader makes a branded value. Call the reader, or in a test a builder from @internal/test-session, rather than casting."                                                                                                                                                                                                                                                             | Call the type's reader. In a test, use `slug`, `aCodeId`, `aRoleId` or `aViewer` from `@internal/test-session`. A cast to an object that holds a brand, such as `as unknown as AccessRule`, still passes.                                                                           |
| `robkit/no-json-cast`              | "Parsed JSON is unknown until a reader checks it. Read it with one rather than casting it."                                                                                                                                                                                                                                                                                                  | Pass `JSON.parse(...)` or `await res.json()` to a reader, as [docs/conventions/input.md](../../docs/conventions/input.md) shows. Tests may cast.                                                                                                                                    |
| `robkit/no-silent-catch`           | "This catch discards its error. Use it (translate, log or rethrow with cause), or say in a comment why dropping it is right."                                                                                                                                                                                                                                                                | Rethrow with `{ cause }`, return a problem, or log it. If dropping it really is right, put a comment inside the `catch` saying why. See [docs/conventions/errors.md](../../docs/conventions/errors.md).                                                                             |
| `robkit/one-problem-type`          | "A failed read is an InputProblem from @robkit/input, not a { error: string } of its own." On an `"error" in` check: "Check a read with isProblem from @robkit/input, not "error" in". On `throw new Error(x.error)`: "A problem the person can fix isn't a fault. Throw it as a CommandProblem in a command line, end an app server with orExit, or use orThrow where nothing better fits." | Return `InputProblem` from a reader and check the result with `isProblem`. Throw a problem the person can fix as a `CommandProblem`, end a server with `orExit`, or call `orThrow`. Tests and `test/` helpers may throw one.                                                        |
| `robkit/relative-import-extension` | "Relative imports use the .ts extension, so Node can run source files directly."                                                                                                                                                                                                                                                                                                             | Write `./guard.ts`, not `./guard` or `./guard.js`.                                                                                                                                                                                                                                  |

## Other rules worth knowing

| Rule                                                    | Fails on                                                                | What to do                                                                                                   |
| ------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `@typescript-eslint/no-unsafe-type-assertion`           | A cast outside tests, such as `value as RoleId`                         | Use a reader or a type guard. Tests (`*.test.ts`, `*.test-d.ts`, `*.test.tsx` and `test/` folders) may cast. |
| `preserve-caught-error`                                 | A `throw new Error(...)` inside a `catch` that doesn't pass `{ cause }` | Pass the caught error as `cause`. The `catch` must name its error.                                           |
| `@eslint-community/eslint-comments/require-description` | An `eslint-disable` comment without a reason                            | Say why after `--`: `// eslint-disable-next-line no-debugger -- stops here on purpose`.                      |
| Unused disable directives                               | An `eslint-disable` comment that disables nothing                       | Delete it.                                                                                                   |

`suppressions.test.js` covers the last two.

## The layer rule

`layers.js` holds the rule as rows. Each row says which workspaces it binds (`applies`), the message ESLint prints (`rule`), and what those workspaces may not use: bare imports (`modules`), folders a relative import may not reach into (`folders`), and globals (`globals`).

The rows today:

- `@robkit/input`, `@robkit/session` and `@robkit/guard` import no framework (Hono, React, TanStack and the like).
- `@robkit/input` and `@robkit/guard` import no Node built-in and uses no `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` or `process`.
- `coreRows()` adds a row for each package that `package-graph.js` doesn't let take `@robkit/core`. That package may not import it, or reach into `packages/core` with a relative path.

Apart from the rows, the rule fails a relative import that leaves its workspace, in every package under `packages/` and `tooling/`.

### Add a row

1. Add an entry to `layers` in `layers.js`, with a message that starts "Layer rule:" and names the rule in a sentence.
2. Add a case to `layers.test.js` that lints a file breaking it.
3. Add the rule to the layer rule section of [AGENTS.md](../../AGENTS.md), in the same commit. A new rule goes in with its lint rule.

`graph-check.test.ts` in `tooling/repo-checks` fails if a row forbids an edge that `package-graph.js` allows, so the two can't disagree.

## The package graph

`package-graph.js` lists which workspace package may depend on which. Each package has two lists: `dependencies`, what its runtime code may import, and `devDependencies`, what only its tests, `src/test` helpers and config may import. Any package may take the shared ESLint and TypeScript configs (`toolchain`) without an edge.

### Add an edge

Say `@robkit/react` needs `@robkit/guard` at runtime:

1. Add `"@robkit/guard": "workspace:*"` to `packages/react/package.json`'s `dependencies`.
2. Add `"@robkit/guard"` to `@robkit/react`'s `dependencies` in `package-graph.js`.
3. Commit both together.

`graph-check.test.ts` fails on a `package.json` edge or an import the graph doesn't list, on an edge the graph lists that no `package.json` has, and on a cycle. If the new edge gives a package `@robkit/core`, its core row goes away by itself.

A new workspace package gets an entry here too, even with no edges.

## Add a rule

1. Write the rule in its own file, with a `messages` entry that says what to do, not only what's wrong.
2. Register it in `index.js` under `robkit` and turn it on.
3. Test it in a `*.test.js` beside it, with code it passes and code it fails.
4. Fix or justify every existing violation in the same pull request, so lint stays green.
5. Add it to the table above, and to [AGENTS.md](../../AGENTS.md) if it enforces a convention there.

```sh
pnpm --filter @internal/eslint-config test   # the rules' tests
pnpm lint                                     # every package
```
