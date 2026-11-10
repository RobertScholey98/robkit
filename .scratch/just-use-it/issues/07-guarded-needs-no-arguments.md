# 07: `guarded()` needs no arguments

**What to build:** Every app's first lines read robkit's settings by hand: `guarded(orExit(readGuardEnv(process.env)))`. The app's author has to learn `@robkit/input`, a reader and `orExit` before they write a route. The guard can read its own settings.

- **The call.** `guarded()` in `@robkit/hono`, `@robkit/express` and `@robkit/next`, and `guarded(entry)` in `@robkit/start`, work with no options. They read `ROBKIT_APP` and `ROBKIT_CORE_URL` from `process.env`.
- **One place reads them.** `requestGuard` in `@robkit/session` takes its options as optional and reads what is missing, so no adapter repeats it.
- **A misconfigured app still refuses to start.** A missing or malformed setting ends the process with the reader's own message and no stack trace, as `orExit` does today. `docs/conventions/errors.md` says how a boundary treats this; follow it, and record the choice.
- **Options stay, all optional.** `app`, `core`, `access` and `onUnavailable` keep their meaning, for an owner who overrides one. `app` and `core` also take a plain string, read by the same readers, so nobody needs `@robkit/input` to pass one.
- **Go.** The Go template makes one call to get its guard, with one error to check. Add what `go/session` needs for that.
- **Core's origin, for an app that shows it.** Admin puts core's origin in its page, and reads it today with `orExit(readCoreUrl(process.env))`. `@robkit/session` exports `coreOrigin()`, which reads `ROBKIT_CORE_URL` as `guarded()` does and fails the same way, and each adapter re-exports it. Admin calls it from `@robkit/hono`.
- **Start's type block.** Start's `server.ts` also carries a `declare module "@tanstack/react-start"` block that tells TanStack the guard's viewer is in the request's context. It is robkit's wiring, not the app's. Ship it in `@robkit/start`'s own types if it then applies in an app that has no such line, and an app can still add its router to the same interface. Prove it in a linked install and in a packed one, not in this workspace: a linked install's `@robkit/start` finds its own copy of `@tanstack/react-start` in the checkout, and the block may then land on a different module than the app's. If it can't be made to apply in both, keep the block and say why.
- **Templates.** Every stack's server file calls `guarded()` with no argument and drops its `@robkit/input` import. Admin's `server.ts` passes only its access rule and calls `coreOrigin()`. It keeps `isRecord` from `@robkit/input`, which it uses to read Vite's manifest and which reads no setting. Each stack's `AGENTS.md`, each adapter's README and `docs/conventions/errors.md`'s example change to match.

**Blocked by:** 06

**Status:** done

- [x] In each adapter, `guarded()` with `ROBKIT_APP` and `ROBKIT_CORE_URL` set guards as `guarded(readGuardEnv(env))` does today
- [x] With either unset or malformed, the app exits with the reader's message, and the test shows the message
- [x] Passing `app` and `core` as plain strings works, and a bad one fails the same way
- [x] Each adapter's `*.test-d.ts` says the no-argument call compiles
- [x] No stack template's server file imports `@robkit/input`, and neither a stack's nor admin's imports a reader of the guard's settings or reads `process.env` for them
- [x] `coreOrigin()` gives core's origin from `ROBKIT_CORE_URL`, and exits with the reader's message when it is unset or malformed
- [x] Start's `server.ts` is its imports and one call, with the viewer typed in a linked and in a packed install, or the ticket's comments say why the type block had to stay
- [x] The Go template gets its guard in one call
- [x] The API reports, READMEs and each stack's `AGENTS.md` show the new call
- [x] A `core` that is http on a domain that isn't local is refused by `requestGuard` itself, however it was typed
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### From milestone 1's code review, added by the lead

`requestGuard` in TypeScript trusts the `CoreOrigin` type and never looks at the value again. Go's `Guarded` checks it again when it runs (`go/session/guarded.go`). So a plain JavaScript app, or a cast, can hand the TypeScript guard an http origin on a domain that isn't local, and nothing refuses it. Every template reads the setting through `readGuardEnv`, so no install is exposed today.

This ticket makes `requestGuard` read its own settings and take `core` as a plain string. Run every `core` it is given through the reader, a typed one included, so the two ports refuse the same values.

### Chosen in the build

- **A setting that won't do ends the process through `orExit`.** `errors.md` says an app's server reads its environment with `orExit`, and the guard reads its settings as the server starts, so it is the same boundary. `readGuardSettings` in `packages/session/src/guard-settings.ts` reads both, reports every problem at once, and calls `orExit`. `errors.md` records it under "The guard's settings".
- **An option's problem names the option.** `readCoreUrl` and `readAppSlug` in `@robkit/input` take an optional name, `ROBKIT_CORE_URL` and `ROBKIT_APP` by default. The guard passes `guarded()'s core` and `guarded()'s app`, so `guarded({ core: "http://core.example.com" })` prints `guarded()'s core is "http://core.example.com", which is http on a domain that isn't local. ...`.
- **Each setting is read on its own.** A given `app` is read and `ROBKIT_APP` isn't, and the same for `core`. `appOrigin(settings?)` reads them the same way, so Express and Next, which call it beside `requestGuard`, agree with the guard.
- **`GuardedOptions` takes `app` and `core` as `string`.** A `Slug` and a `CoreOrigin` are strings, so both still fit. `GuardSettings` in `@robkit/session` is the two of them.
- **Go: `session.Guarded(session.Options{})`.** `Guarded` reads `App` and `Core` from the environment where `Options` leaves them empty, with `ReadGuardEnv`'s messages, and still checks every value it is given. `ReadGuardEnv` stays, now reading through the same code. The template's `main` prints the error and exits 1, as before.
- **Admin's meta tag is `coreOrigin()` as it is**, since that is already an origin; it was `new URL(core).origin`.
- **Tests see the exit with `printedOnExit`** from `@internal/test-session`, which stands in for `process.exit` and `console.error` and returns what was printed.

### Start's type block stays in `src/server.ts`

It couldn't be made to apply in both kinds of install, so it stays, and the template, Start's `AGENTS.md` and its README say why. What I tried, with the block moved into `@robkit/start`'s `guarded.ts` (and a type import of `@tanstack/react-start`, which its build needed) and removed from the template:

- **Linked install** (`create-robkit --stack start --link --install`, then `tsc` in `apps/example`): the block lands on the checkout's copy of TanStack's `Register`, not the install's. `src/routes/index.tsx` fails with `Property 'viewer' does not exist on type 'undefined'`, and `server.ts` fails because the checkout's `ServerEntry` now wants a context the install's doesn't. With no block anywhere (the control) the route fails the same way.
- **Packed install** (the same, then `robkit vendor` and `pnpm install`): the packed `dist/guarded.d.ts` holds the block, and every `@tanstack/react-start` and `@tanstack/router-core` import resolves to one file each, but `Register` still has no `server`, and the route fails the same way. Adding `import type {} from "@tanstack/react-start"` to the packed `.d.ts` by hand changed nothing.
- **The file matters.** In that packed install the original block works in `src/server.ts`, alone or with the rest of the file. The same block, or the whole original `server.ts`, in `src/other.ts`, `src/reg.ts` or `src/reg.d.ts` doesn't. I didn't find what in TanStack's types ties it to that file.

So `@robkit/start` ships no augmentation, `GuardedContext` stays exported, and Start's `server.ts` is its imports, the block and one call. A test in `packages/create-robkit/src/server-files.test.ts` pins that shape.

### For tickets 08, 09 and 11

- **Ticket 08.** `guarded()` reads its settings when it is called, as the server module loads, and exits 1 through `orExit` when one is missing. A test that imports a server file with no `ROBKIT_APP` or `ROBKIT_CORE_URL` ends the run, so a test should import the routes, not the server file, or set both with `vi.stubEnv`. `printedOnExit` in `@internal/test-session` shows what a start printed. No option skips the guard: the options are `app`, `core`, `access` and `onUnavailable`.
- **Ticket 09.** No stack's server file imports `@robkit/input` now. Each stack's `package.json` still lists it, because `database.ts` and `serve.ts` import it, and Next's `next.config.ts` and the Vite configs read `readGuardEnv` or `readCoreUrl`. Admin's `server.ts` imports only `isRecord`.
- **Ticket 11.** `coreOrigin()` is in `@robkit/session` and each adapter. A `serve()` that needs core's origin can use it, and fails the same way.
- **`readGuardEnv`** in `@robkit/input` and Go's `ReadGuardEnv` have no caller in the templates now, besides Next's config and the Vite configs, which ticket 10 replaces.
