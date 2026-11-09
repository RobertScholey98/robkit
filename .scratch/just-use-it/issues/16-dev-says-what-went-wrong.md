# 16: `pnpm dev` says what went wrong

**What to build:** The first thing a new owner runs is `pnpm dev`, and its most likely failures print "robkit hit a bug" with a stack trace: Docker not running, port 3000 taken, a second `pnpm dev` already up. Closing the terminal leaves every app running, so the next `pnpm dev` fails on its ports ([review](../research/review-2026-11-09.md), "create-robkit and dev").

- **Checks before anything starts.** `robkit-dev` checks that Docker answers and that every port it needs is free: the proxy's, each app's, and Postgres's. It does this before Compose starts. Each failure is one `CommandProblem` that says what to do: start Docker, set `ROBKIT_DEV_PORT` or `ROBKIT_POSTGRES_PORT`, or stop the other `pnpm dev`.
- **Several problems print as problems.** When everything that failed is a `CommandProblem`, `runCommand` prints each message and no bug banner. A failed `compose up` doesn't also report the `compose stop` that follows it.
- **Closing the terminal stops everything.** SIGHUP stops the runner as SIGINT does: apps, proxy, then Postgres. Fix the comment in `runner.db.test.ts` that says a terminal close sends SIGTERM.
- **The proxy listens on loopback only.** `127.0.0.1`, with no setting to widen it. Another machine can't resolve `*.robkit.localhost`, and any other domain makes the cookies `Secure`, which plain http drops, so a wider listener would serve nothing.
- **A request ends when its app does.** When an app dies or restarts mid-answer, the proxy ends the browser's request and doesn't leave it hanging.
- **Outside an install.** `robkit-dev` and `robkit` run in a folder with no `robkit.json` say so in one line.
- **`turbo ls` failing** in `robkit deploy` prints as a problem with turbo's own message.

**Blocked by:** 12

**Status:** ready-for-agent

- [ ] With Docker stopped, `pnpm dev` prints one line that says to start Docker, exits 1, and starts nothing
- [ ] With the proxy's port or Postgres's port taken, it names the port and the variable that moves it, and starts no app
- [ ] SIGHUP stops every app, the proxy and Postgres, and a second `pnpm dev` then starts cleanly
- [ ] The proxy refuses a connection that doesn't come from loopback
- [ ] A request whose app is killed mid-answer ends within a second
- [ ] No expected failure above prints "robkit hit a bug"
- [ ] The PR's CI `gate` job passes on GitHub
