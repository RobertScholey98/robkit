# 16: Errors that say what was tried and what to do

**What to build:** Every error a person can see says what failed and what to do next. An app server with bad config exits with that one message, not a stack trace. A lint rule keeps bare errors out.

The round-2 reviewers found these:
- App servers in the templates throw their config problem, so a missing env var prints a stack trace.
- Generated `call-core.ts` times out the fetch, but reading the body has no timeout.
- Core's fault messages in `sessions.ts`, `owner.ts`, `signing-key.ts` and `access-codes.ts` don't say what was attempted.
- `vendor.ts` and `scripts/shadcn-kit.ts` fail without the exit code, the folder or the fix.
- create-robkit's `json.ts` and `vendor.ts` throw `new Error(problem.error)`.
- `fieldsOf` in core's routes accepts JSON that isn't an object.
- 48 places `throw new Error` with no detail.

Raises rubric categories 7 (error handling) and 6 (consistency). Evidence: `../research/council-r2-opus.md` sections 3, 6 and 7; `../research/council-r2-sol.md` section 7; `../research/council-r2-sonnet.md` sections 6 and 7.

- **App servers with bad config.** One helper, beside the app env readers wherever ticket 14 put them, prints the problem alone and exits 1. Every template `server.ts`, `serve.ts` and `database.ts` uses it. Test it through a generated install's server with a missing variable.
- **`call-core.ts`.** Fetching and reading the body share one timeout and one error classification, with an optional diagnostic callback. Test a response whose headers arrive but whose body never finishes.
- **Core's faults.** Each fault names what was attempted: the table, the key or the attempt count. A wrapped error keeps its `cause`.
- **Command failures.** `vendor.ts` and `shadcn-kit.ts` name the command, the folder, the exit code and the fix, as `docs/conventions/errors.md` asks.
- **One problem type.** `json.ts` and `vendor.ts` throw `CommandProblem`. Extend the `robkit/one-problem-type` lint rule to flag `throw new Error(<x>.error)`.
- **Non-object JSON.** `fieldsOf` returns "Send a JSON object." for JSON that isn't an object, with a test.
- **A lint rule against bare errors.** `robkit/no-bare-error` fails on `throw new Error("...")` with a fixed message and no `cause`. Its tests list what it allows. Fix what it finds.
- **Docs and changesets.** You own `docs/conventions/errors.md`. Add changesets.

**Blocked by:** 14

**Status:** ready-for-agent

- [ ] An app server with a config problem prints it alone and exits 1
- [ ] call-core times out a stalled body, with a test
- [ ] Core's faults and the vendor commands say what was tried and what to do
- [ ] `throw new Error(x.error)` and bare errors fail lint, and the repo passes
- [ ] `fieldsOf` refuses JSON that isn't an object
- [ ] The PR's CI `gate` job passes on GitHub
