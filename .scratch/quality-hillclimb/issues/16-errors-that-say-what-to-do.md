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

**Status:** done

- [x] An app server with a config problem prints it alone and exits 1
- [x] call-core times out a stalled body, with a test
- [x] Core's faults and the vendor commands say what was tried and what to do
- [x] `throw new Error(x.error)` and bare errors fail lint, and the repo passes
- [x] `fieldsOf` refuses JSON that isn't an object
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### What I chose, and why

- **`orExit` is in `@robkit/input`,** in `app-env.ts` beside the app env readers, as the ticket asked. Input's layer row forbids `process`, so `orExit` has the one `eslint-disable` for it, with its reason, and so does its unit test. Input's README says it does no I/O apart from `orExit`. I kept it out of session: an app can't import session's bare entry, and no template depends on session.
- **Every template `serve.ts`, `server.ts` and `database.ts` uses `orExit`,** and so do core's `main.ts`, `migrate.ts` and `provision.ts` and each stack's `migrate.ts`, which printed and exited by hand. The vite configs keep `orThrow`, since Vite prints what they throw. `database()` reads its URL on first use, so a server without `DATABASE_URL` now exits on its first query rather than failing every request.
- **The test through a generated install** is `tooling/e2e/src/config-problems.test.ts`. It runs admin's `src/serve.ts` without `ROBKIT_CORE_URL`, and the example's `src/migrate.ts` without `DATABASE_URL`, and expects exit 1 with the problem alone on stderr. Admin's is the one server Node runs straight from source: the react-hono example's is TSX, and Start's is a Vite entry.
- **`callCore`** reads the body as text inside the same `try` as `fetch`, so one deadline covers both, and a stalled or broken body is classified as the fetch is. The test stands in for `AbortSignal.timeout` with a controller it aborts after the headers arrive. The optional callback is `report(message, cause)`, the shape of robkit's `Report`. It hears transport failures and an answer that isn't JSON. The hub and admin don't pass one yet.
- **Core's faults.** Each now names the table and what it was storing: the session's holder, the owner's username, the signing key's id, or the 5 attempts at a free access code. The three "insert returned no row" checks moved into `storedRow` in `database.ts`, with a unit test. No test can reach them, since an insert with `returning` always gives back a row, and spreading each over four lines took core's line coverage to 96.74%, under its 97. None of those files wraps an error, so there was no `cause` to add.
- **`json.ts` stays a fault, against the ticket.** The ticket asked for it to throw `CommandProblem`. But `jsonObject` reads only files robkit ships: its templates, its own manifests and shadcn's output. `errors.md` says a bad one is a bug, and a `robkit add` test pins that ("prints a malformed file robkit ships as a fault"). Files the person owns, `robkit.json` and a template override, already throw `CommandProblem` in `add.ts`. So `jsonObject` throws through `orThrow`, which meets the lint rule, and a test pins that it isn't a `CommandProblem`.
- **`vendor.ts`** builds through dev's `exec`, which names the command, folder and exit code and says the output is above. The pack captures its output, so its `CommandProblem` names the same and puts what pnpm printed in the message. pnpm prints one object, not a list, when it packs a single package, which vendor read as no tarball; it reads both now. A package pnpm didn't pack names the folder to check.
- **`shadcn-kit.ts`** runs under `runCommand`, runs shadcn through dev's `exec`, and throws a `CommandProblem` that says what to change for each refusal.
- **The lint rules skip tests.** `robkit/no-bare-error` sits in the config block that already exempts tests from casts. The `throw new Error(x.error)` check in `robkit/one-problem-type` skips tests and `test/` helpers too, through `isTestFile` in `tooling/eslint/test-files.js`, which holds the one list of what counts as a test. I chose that over editing the six `src/test/slug.ts` helpers: one is in `packages/session/src/`, which I was told to stay out of, and ticket 19 may replace them all. `isTestFile` matches by pattern, not glob, because `**` skips dot folders such as this worktree's `.t3`.
- **What `no-bare-error` refuses:** `throw new Error()`, or `throw new Error("...")` with fixed text (a string, or a template literal with no `${}`) and no second argument. It allows an interpolated message, a `cause`, a message from a variable or built with `+`, another class such as `CommandProblem` or `TypeError`, and an `Error` that isn't thrown where it's made. Its tests list each case.
- **What the rules found.** `no-bare-error` found 14 sites outside tests: 5 in core, `conformance.ts` in the guard, `robkit-repo.ts` in create-robkit, 6 in e2e's helpers and `catalog.ts` in repo-checks. Each now names the table, file, job, folder or count. The thrown-problem check found `orThrow` itself, which keeps a disable as the one place a problem becomes an `Error`, and two repo-checks sites, which now call `orThrow`.
- **An install's lint** refuses `throw new Error(x.error)` outside tests too, with a `no-restricted-syntax` selector beside its other one-problem-type selectors. I didn't give installs `no-bare-error`: the hub's and admin's `main.tsx` throw fixed sentences, and that is a template change of its own.
- **`fieldsOf`** returns an `InputProblem`: "Send a valid JSON body." for a body that isn't JSON, and "Send a JSON object." for JSON that isn't an object. `/login/code` still answers "Send a code." for either. Two older tests had pinned the old answer for `null` and `"rob"`; they now expect "Send a JSON object.".

### Proof

- Each behaviour change went red first: vendor's four new tests, shadcn-kit's usage test, `orExit`'s tests, `callCore`'s four new tests (run in a linked install), core's signing-key and free-code tests and the four `fieldsOf` cases (in WSL), and the guard's conformance cases.
- Before the template change, admin's `node src/serve.ts` without `ROBKIT_CORE_URL`, in an install made with `pnpm create-install`, printed a stack from `orThrow`. After it, a fresh install printed the one line and exited 1. So did the example's `migrate.ts` without `DATABASE_URL`, and core's `main.ts`. That install's `pnpm lint` and `pnpm typecheck` passed, and its core-client (15), hub (48) and admin (32) tests passed.
- The install's lint selector fired on a probe file that threw `new Error(read.error)`.
- `pnpm check` on Windows: 48 of 48 tasks passed.
- Core's whole suite in WSL with Docker: 246 tests passed, coverage 96.77 / 96.13 / 91.61 / 97.28 against thresholds of 96 / 95 / 91 / 97.

### Not verified

- The new e2e test didn't run locally, since other tickets were running. CI's full gate runs it.
- shadcn-kit's failure paths beyond the usage message, since running it needs the network. Its shadcn calls go through dev's `exec`, which has its own tests.
- vendor's message for pack output that isn't JSON. I found no way to make pnpm print that.

### For the coordinator

- **Ticket 15:** `no-bare-error` found nothing in `packages/session/src/` today. A new fixed-sentence `throw new Error` in `core-access.ts` without a `cause` will fail lint once both land. `session/src/test/slug.ts` is a test helper, so the new check skips it.
- **Ticket 19** landed while this ran. Merging `56-round-3` in conflicted only in `AGENTS.md`, the ESLint README and `tooling/eslint/index.js`, where each side added a rule; the merge keeps both. After it, `pnpm check` passed 48 of 48 tasks, and core's suite in WSL passed 324 tests.
- **Docs another ticket may own:** `packages/session/README.md`, `packages/hono/README.md` and `packages/start/README.md` show `orThrow(readGuardEnv(...))` in a module that reads its environment as it loads. That still works, but a server would read better with `orExit`.
