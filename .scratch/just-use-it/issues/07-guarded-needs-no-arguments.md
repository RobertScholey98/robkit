# 07: `guarded()` needs no arguments

**What to build:** Every app's first lines read robkit's settings by hand: `guarded(orExit(readGuardEnv(process.env)))`. The app's author has to learn `@robkit/input`, a reader and `orExit` before they write a route. The guard can read its own settings.

- **The call.** `guarded()` in `@robkit/hono`, `@robkit/express` and `@robkit/next`, and `guarded(entry)` in `@robkit/start`, work with no options. They read `ROBKIT_APP` and `ROBKIT_CORE_URL` from `process.env`.
- **One place reads them.** `requestGuard` in `@robkit/session` takes its options as optional and reads what is missing, so no adapter repeats it.
- **A misconfigured app still refuses to start.** A missing or malformed setting ends the process with the reader's own message and no stack trace, as `orExit` does today. `docs/conventions/errors.md` says how a boundary treats this; follow it, and record the choice.
- **Options stay, all optional.** `app`, `core`, `access` and `onUnavailable` keep their meaning, for tests and for an owner who overrides one. `app` and `core` also take a plain string, read by the same readers, so nobody needs `@robkit/input` to pass one.
- **Go.** The Go template makes one call to get its guard, with one error to check. Add what `go/session` needs for that.
- **Templates.** Every stack's server file calls `guarded()` with no argument and drops its `@robkit/input` import. Each stack's `AGENTS.md`, each adapter's README and `docs/conventions/errors.md`'s example change to match.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] In each adapter, `guarded()` with `ROBKIT_APP` and `ROBKIT_CORE_URL` set guards as `guarded(readGuardEnv(env))` does today
- [ ] With either unset or malformed, the app exits with the reader's message, and the test shows the message
- [ ] Passing `app` and `core` as plain strings works, and a bad one fails the same way
- [ ] Each adapter's `*.test-d.ts` says the no-argument call compiles
- [ ] No stack template's server file imports `@robkit/input` or reads `process.env` for the guard
- [ ] The Go template gets its guard in one call
- [ ] The API reports, READMEs and each stack's `AGENTS.md` show the new call
- [ ] The PR's CI `gate` job passes on GitHub
