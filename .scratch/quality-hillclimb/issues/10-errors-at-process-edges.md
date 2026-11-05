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

**Status:** ready-for-agent

- [ ] The dev runner handles a child's `error`, runs every cleanup step, and treats only `ESRCH` as gone, each with a test
- [ ] A failed command says what ran, where, its exit code and what to do
- [ ] A malformed file the person owns prints as a `Problem`; one robkit ships stays a fault
- [ ] Core's 500 and its log line share a request id
- [ ] One `Report` type serves core, the guard and the command lines
- [ ] The full gate passes: `pnpm check:all`
