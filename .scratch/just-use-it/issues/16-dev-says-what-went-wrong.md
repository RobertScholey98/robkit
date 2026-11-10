# 16: `pnpm dev` says what went wrong

**What to build:** The first thing a new owner runs is `pnpm dev`, and its most likely failures print "robkit hit a bug" with a stack trace: Docker not running, port 3000 taken, a second `pnpm dev` already up. Closing the terminal leaves every app running, so the next `pnpm dev` fails on its ports ([review](../research/review-2026-11-09.md), "create-robkit and dev").

- **Checks before anything starts.** `robkit-dev` checks that Docker answers and that every port it needs is free: the proxy's, each app's, and Postgres's. It does this before Compose starts. Each failure is one `CommandProblem` that says what to do: start Docker, set `ROBKIT_DEV_PORT` or `ROBKIT_POSTGRES_PORT`, or stop the other `pnpm dev`. An app's port follows the proxy's, so for a taken app port the message names the port and the app, and says to free it or move `ROBKIT_DEV_PORT`. A second `pnpm dev` in the same install fails this check and leaves the first one running.
- **One place to set them.** Compose reads the install's root `.env` by itself, and the runner reads only the shell. So `ROBKIT_POSTGRES_PORT` in that file moves Postgres and not the runner, which then can't reach it. The runner reads the root `.env` too, for `ROBKIT_` names alone, and the shell wins over the file as it does for Compose. The messages above name that file. `util.parseEnv` reads it, which changes nothing in the runner's own environment.
- **Its own Postgres doesn't count as taken.** A runner that was killed leaves this install's Postgres container up, and `compose up` copes with that today. A Postgres port held by this install's own Compose service passes the check.
- **Several problems print as problems.** When everything that failed is a `CommandProblem`, `runCommand` prints each message and no bug banner. A failed `compose up` doesn't also report the `compose stop` that follows it.
- **Closing the terminal stops everything.** SIGHUP stops the runner as SIGINT does: apps, proxy, then Postgres. A closed terminal also closes the runner's output, and a write to it then fails. Once it is stopping, the runner ignores a failed write, so the stop still finishes. Fix the comment in `runner.db.test.ts` that says a terminal close sends SIGTERM.
- **The proxy listens on loopback only.** On `127.0.0.1`, and on `::1` where the machine has it, since a browser may try either for a `.localhost` name. On nothing else. A machine with IPv6 off refuses `::1`, and the proxy starts without it. `pnpm dev` serves a local domain (ticket 02), which only this machine resolves, so a wider listener would serve nobody. Check that a browser on Windows still reaches an install running in WSL 2, which is how robkit runs on Windows today.
- **Apps listen on loopback too.** Core and every stack's dev server default to `127.0.0.1`, and core and the Go stack read `HOST`. The runner passes the shell's environment on, so a `HOST` the shell exports would move them. The runner sets `HOST` to `127.0.0.1` for core and every app.
- **It prints an address when the app answers.** Today the runner prints every address as soon as it has spawned the apps, and the first click gets the proxy's "is not answering". It prints each app's address once that app's port takes a connection. Probing the port works for every stack, where reading a start-up line doesn't. Holding requests instead would hide an app that never comes up.
- **A request ends when its app does.** When an app dies or restarts mid-answer, the proxy ends the browser's request and doesn't leave it hanging.
- **Outside an install.** `robkit-dev` and `robkit` run in a folder with no `robkit.json` say so in one line.
- **`turbo ls` failing** in `robkit deploy` prints as a problem with turbo's own message.

**Blocked by:** 12

**Status:** ready-for-agent

- [ ] With Docker stopped, `pnpm dev` prints one line that says to start Docker, exits 1, and starts nothing
- [ ] With the proxy's port or an app's port taken, or Postgres's port taken by something else, it names the port and the setting that moves it, and starts no app
- [ ] A second `pnpm dev` in the same install exits 1 with one line, and the first keeps answering
- [ ] `ROBKIT_POSTGRES_PORT` in the install's root `.env` moves Postgres and the runner together, and the shell's value wins over the file's
- [ ] After `kill -9` of a running `pnpm dev`, and of the apps it left, the next `pnpm dev` starts with no change to any setting
- [ ] SIGHUP with the runner's stdout and stderr closed, as a closed terminal leaves them, stops every app, the proxy and Postgres, and a second `pnpm dev` then starts cleanly
- [ ] The proxy is bound to `127.0.0.1`, to `::1` where the machine has it, and to no other address, and it starts on a machine with no `::1`
- [ ] With `HOST` exported in the shell, core and every app still listen on `127.0.0.1`
- [ ] A request made the moment an address is printed gets the app's answer, not the proxy's
- [ ] A request whose app is killed mid-answer ends within a second
- [ ] `robkit-dev` and `robkit`, each run outside an install, print one line that says so
- [ ] A failing `turbo ls` in `robkit deploy` prints turbo's message
- [ ] No expected failure above prints "robkit hit a bug"
- [ ] The Proof says what a Windows browser saw against an install in WSL 2
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### From milestone 2, added by the lead

In a robkit checkout an install links to, `robkit-core serve` runs core under `node --watch` (`watches()` in `packages/core/src/robkit-core.ts`). Ticket 11's worker saw core's restart test (`robkit-core.db.test.ts`, "restarts core when its source changes, in a checkout") leave a `serving.ts` process behind once in four runs. The test touches a source file and then stops the command, so SIGTERM can reach Node's watcher while it is between the old child and the new one. I haven't reproduced it or found the cause.

What else milestone 2 changed under this ticket:

- **`runCommand` and `CommandProblem` are in `@robkit/input/command`** (ticket 12). `@robkit/provision` returns a refusal as a value, and `provisionApps` in `packages/dev/src/provision.ts` turns it into a `CommandProblem`.
- **Two stop limits don't agree.** The runner gives an app 5 seconds after SIGTERM before it kills its group (`stopTimeoutMs` in `packages/dev/src/process-group.ts`). Core under `pnpm dev` serves through `@robkit/serve`, whose stop takes up to 8 seconds when a connection has sent nothing, and core then gives its database 1 more. So the runner can kill core before it would have stopped by itself. A kill is harmless in dev, where sessions are in the database. Leave it and say so in the comments, or make the two agree.
- **For "it prints an address when the app answers"**, core prints `core listening on <host>:<port>` and each stack's dev server prints its own line. Probing the port works for every stack. Reading lines doesn't.
- **`guardedAs()` refuses under `pnpm dev`** since milestone 2's code round. An app that left one in its server answers 500 with a message that says so. That is an app's fault to print, not the runner's.

On the leftover watch process: it can't happen in an install from npm, which runs no watcher. In a linked checkout a leftover core would hold core's port, and the next `pnpm dev` would fail on it. The port check this ticket adds will name that port. If you see the leftover while you build this, find out whether Node's watcher or `runChild` loses the signal, and say what you found.

### From the ticket round, 2026-11-10

Opus 5.5 and Sol 6.1 read milestone 3's tickets at `a314729`. Opus had two must-changes here, and I took both. I checked each point against the code.

- **`::1` isn't on every machine** (Opus, must-change). A container, or a machine with IPv6 off, refuses to listen on it. The ticket's criterion asked for both addresses with no way out.
- **The SIGHUP criterion didn't test a closed terminal** (Opus, must-change). A test that sends SIGHUP with the output still open passes on a runner that dies on its first failed write, which is the fault this ticket is here to fix.
- **A root `.env` moved Compose and not the runner** (Opus). The runner calls `docker compose` with `cwd` at the install's root, and Compose reads `.env` there. `readDevConfig` in `packages/dev/src/env.ts` reads only the environment it is handed.
- **A `HOST` from the shell reached core and the Go stack** (Opus). `runner.ts` spreads the shell's environment into each app's.
- **Probing is chosen** (Opus), so the build doesn't have to choose.
- **Criteria added** for an app's port, a second runner, a run outside an install and a failed `turbo ls` (both).
- **For the Windows proof**, `curl.exe` from PowerShell stands in for a browser: it resolves a name under `.localhost` to loopback itself, as a browser does.
