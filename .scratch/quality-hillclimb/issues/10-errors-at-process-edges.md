# 10: Errors at the edges of processes and requests

**What to build:** Failures where robkit starts processes, stops them and answers requests reach someone who can act on them, with what to do. The round-1 reviewers found: the dev runner listens only for a child's `exit`, so a spawn `error` escapes cleanup; a rejected stop skips the proxy's and Docker's cleanup; a signal-zero probe treats any error as "gone", not only `ESRCH`; create-robkit's `set-up.ts` rejects with a bare exit code; `exec` doesn't say where it ran; a malformed `package.json` in an install's own `robkit/templates/<stack>` override prints as a robkit bug with a stack; and a person who sees core's generic 500 has nothing to find it by in the log.

Raises rubric categories 7 (error handling) and 6 (consistency). Evidence: `../research/council-r1-sol.md` section 7, `../research/council-r1-opus.md` sections 6 and 7, `../research/council-r1-sonnet.md` sections 6 and 7.

- `packages/dev/src/runner.ts`: a child's `error` event goes through the same stop path as an exit. Stopping runs every cleanup step (apps, proxy, Postgres, listeners) even when one fails, then throws what failed with each cause. The process-group probe treats only `ESRCH` as gone and rethrows anything else with its cause. Test each with a fake child or a real one that can't spawn.
- `packages/create-robkit/src/set-up.ts` and `packages/dev/src/exec.ts`: a failed command names itself, its exit code and the folder it ran in, says its output is above, and keeps a spawn error as `cause`. A failure the person can fix (git or pnpm missing, install failing) is a `Problem`.
- A malformed file the person owns (an install's template override, `robkit.json`) is a `Problem` that names the file; a malformed file robkit ships stays a fault. Test both through the command line.
- Core's 500 carries a request id, in a header and the JSON body, and the `logError` line for it has the same id. Test that they match.
- One logging seam: one `type Report = (message: string, cause?: unknown) => void`, used by core's `logError`, the guard's default `onUnavailable` and the command lines' fault printing, instead of three shapes. Keep the public option names unless a rename is clearly better; say which in Comments.
- Update `docs/conventions/errors.md` for anything new. It is this ticket's to edit.

**Blocked by:** none

**Status:** done

- [x] The dev runner handles a child's `error`, runs every cleanup step, and treats only `ESRCH` as gone, each with a test
- [x] A failed command says what ran, where, its exit code and what to do
- [x] A malformed file the person owns prints as a `Problem`; one robkit ships stays a fault
- [x] Core's 500 and its log line share a request id
- [x] One `Report` type serves core, the guard and the command lines
- [ ] The full gate passes: `pnpm check:all`

## Comments

**What I chose**

- `Report` lives in `@robkit/session`'s root entry, beside `reportToConsole`, its one default: the message, then the cause on its own line with its stack. Core's `logError` is a `Report`; the guard's default `onUnavailable` reports through `reportToConsole`; `runCommand` takes a `Report` as its second argument. I kept the names `logError` and `onUnavailable`, since neither rename is clearly better: `onUnavailable` hands over a structured `GuardFault`, which is more than a `Report` carries. `runCommand`'s parameter is now `report`, not `print`. Ticket 09 may move `Report` when it splits session's entries.
- A command-line fault now prints "robkit hit a bug. Report it at <url>, with the error below." and then the fault. The old order put the line after the stack, but `Report` is message first, cause second.
- The dev runner's stop path: apps stop together, then the proxy, then Postgres (`failuresOf` in `packages/dev/src/failures.ts`). Every stage runs. `throwFailures` throws one failure as it is, so a `Problem` still prints alone, or several in an `AggregateError`.
- `stopGroup` moved to `packages/dev/src/process-group.ts` and takes a `kill` stand-in, so the `ESRCH`/`EPERM` cases are unit-tested without real processes.
- A child's `error` is reported as a `Problem` from `startProblem` in `exec.ts`, the same words `exec` uses. Node reports a missing working folder as the command's `ENOENT`, so the message says to check both.
- create-robkit's `set-up.ts` keeps its own `run`, because it needs `shell: true` to find `pnpm.cmd` on Windows. It uses the same wording as dev's `exec`. Ticket 09 folds it into `exec`.
- An install's template override is checked in `templateFor` (`add.ts`): no `package.json`, invalid JSON or not an object is a `Problem` naming the file. robkit's own templates still go through `jsonObject`, which throws a fault.
- Core's 500 id is a `randomUUID()`, sent as `X-Request-Id` and `requestId`. The log line reads `GET /path failed (request <id>).`

**Fixed on the way:** `coolify.test.ts`'s hung-request test failed every time on Linux on this branch: its 20 ms timeout never fired, so it ran into vitest's 30 seconds. It passed alone on `47-round-1`. The fake Coolify waited on `request.signal`, which follows the caller's signal through a weak reference. Once the fake dropped the `Request`, garbage collection could break that link, and loading session's root from `cli.ts` made it happen. The fake now waits on `init.signal`. Production code passes its signal straight to `fetch`, so it isn't affected.

**Proof**

- `pnpm check` passes on Windows (42 of 42 tasks).
- In WSL, `pnpm --workspace-concurrency=1 --filter @robkit/dev --filter @robkit/core --filter create-robkit --filter @robkit/session test`: all pass. dev 68 tests, core 231, create-robkit 172, session 226.
- Each new test failed before its change: process-group (4 of 5 red), failures (module missing), exec (2 red), the runner's can't-start test (robkit-dev crashed with an unhandled `error` event), set-up (2 red), the template override CLI tests (3 red), core's request id and default report (red against the old `app.ts` in WSL), and the guard's default (called once, not twice). cli.test's new expectations name a message the old code never printed.
- Coverage thresholds raised to today's numbers: dev 70/77/77/71, create-robkit 70/59/77/71, core functions 91, session 96/93/97/97.

**Not verified:** the full gate (`pnpm check:all`) and the whole-stack test, left for the coordinator. `EPERM` from a real process group isn't reproduced; the fake `kill` covers it.

**Doc changes for their owner (07)**

- `AGENTS.md` line 85: `logError` defaults to `reportToConsole`, not `console.error`. Core's 500 carries a request id, in `X-Request-Id` and the body's `requestId`, that the log line shares.
- `AGENTS.md` line 103: by default the guard reports through `reportToConsole`. Add `Report` and `reportToConsole` to the session section.
- `packages/core/README.md`: `logError` is a `Report`. The 500 carries a request id.
- `packages/session/README.md`: exports `Report` and `reportToConsole`.
- `packages/dev/README.md`: `runCommand(main, report?)` takes a `Report`. A fault prints the bug line first, then the error.
