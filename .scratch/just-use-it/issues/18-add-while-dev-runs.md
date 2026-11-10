# 18: Add an app while `pnpm dev` runs

**What to build:** The README tells a new owner to stop `pnpm dev` before `pnpm robkit add` and start it again after. The runner reads `apps/` once, when it starts, and applies migrations once, when it starts. So adding an app, or changing a table, means a restart. Neither should.

- **The runner can be told things, over a socket file.** `robkit-dev` listens on a Unix socket, not a port. Any web page can send a request to a port on `127.0.0.1`, so a port would need a token, a `Host` check and an `Origin` check to be safe. No browser can open a socket file, and the mode of its folder keeps other users out. So there is no token and no state file.
- **Where the socket is.** Outside the install, since an install on a Windows drive under WSL can't hold one. It sits in a folder only the owner can open: `XDG_RUNTIME_DIR` where that is set, or a folder under `os.tmpdir()` that the runner makes with mode 0700. The runner refuses a folder another user owns or that others can open. The socket's name comes from a hash of the install's real path, so two installs don't share one, and the `robkit` command works the same path out. The whole path stays under 100 bytes, since macOS takes no longer one for a socket.
- **Running or not.** The `robkit` command connects. Nothing answering means no `pnpm dev` is running. A socket file left by a killed run refuses the connection at once, so nothing waits on it, and the next runner removes it before it listens. The runner removes its socket when it stops.
- **What a request can say.** One line of JSON that names an operation, `add` or `migrate`, and a slug. Nothing else: no command, path, variable or credential. The runner checks the slug by the rule every slug passes, and reads the app from `apps/<slug>` itself. It refuses an operation it doesn't know, a line that isn't JSON, and a line over 1 KB, each with a reason the command prints. It handles one request at a time, in the order they arrive, and answers each with one line: done, or the problem.
- **`robkit add` tells it.** Once the new app's files are written and its dependencies installed, `robkit add` sends `add`. The runner checks the app's manifest, gives it a port, provisions its schema and role, runs its `migrate` script, starts it, and routes its subdomain. It provisions the new app alone: the start-up step gives every app a fresh password, which would cut off the apps already running. `robkit add` then prints the app's address. With no `pnpm dev` running it says to run `pnpm dev`.
- **A running app keeps its port.** Today an app's port is its place in the sorted list of apps (`packages/dev/src/apps.ts`), so a new slug that sorts first would shift every port after it. The new app takes a port no running app holds, and no running app moves.
- **A repeated request changes nothing.** An `add` for an app that is already running says so and provisions nothing, so it can't change the app's password under it.
- **Core learns of it.** Core reads `ROBKIT_APPS` when it starts, so the runner restarts core with the new list. Sessions live in the database, so nobody is signed out. Today any app's exit stops the whole runner. A restart the runner asked for is the one exit that doesn't.
- **One app can't take the rest down.** An app that fails to start, or exits while it is being added, prints its problem and leaves every other app answering. `robkit add` prints the same problem and says to fix it and start `pnpm dev` again, which starts every app in `apps/`. Any app's exit still stops the runner once that app has been running.
- **A new migration applies without a restart.** `pnpm robkit migrate <slug>` sends `migrate`. The runner runs that app's `migrate` script with the `DATABASE_URL` it gave the app at start, which only the runner holds. It provisions nothing, so the app's password doesn't change. It serves a migration written by hand, as in a Go app, as well as one `pnpm db:generate` wrote. Put the command in each stack's `AGENTS.md`. With no `pnpm dev` running it says to start it, which migrates.
- **Removing an app** still needs a restart of `pnpm dev`. Say so in the install's `AGENTS.md`.
- **Docs.** The README's quickstart loses "Stop `pnpm dev` first".

**Blocked by:** 15, 17

**Status:** done

- [x] With `pnpm dev` running, `pnpm robkit add notes` brings `notes.<domain>` up with no restart, guarded, with its database migrated, and prints its address
- [x] The launcher shows the new app, and a guest signed in before the add is still signed in after it
- [x] An app that was running before the add answers while the add installs, and still reads and writes its database after it
- [x] Adding an app whose slug sorts before every running app's leaves each running app on its port
- [x] A second `add` for a running app provisions nothing, and the app still reads its database
- [x] An added app whose start fails prints the problem, and every other app keeps answering
- [x] `pnpm robkit migrate notes` applies a migration added while `pnpm dev` runs, and the app sees the new table without a restart and with its password unchanged
- [x] The runner refuses an operation it doesn't know, a slug that fails the slug rule, a line that isn't JSON and a line over 1 KB, each with a reason, and goes on serving
- [x] The socket's folder has mode 0700, and the runner refuses one that others can open
- [x] A socket file left by a killed `pnpm dev` doesn't stop the next one, and `robkit add` then says within a second that no `pnpm dev` is running
- [x] The whole-stack test adds its second app while the install runs
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### From milestone 2, added by the lead

Checked against the code on 2026-11-10, after milestone 2 merged.

- **Provisioning one app is there already.** `provisionDatabase(adminUrl, slug)` from `@robkit/provision` gives one app its schema and role. The runner's `provisionApps` (`packages/dev/src/provision.ts`) calls it for one app at a time and then runs that app's `migrate` script with its `DATABASE_URL`. Adding an app is that loop's body, for the new app alone.
- **The proxy takes its routes once**, in `createProxy(routes)` (`packages/dev/src/proxy.ts`). It needs a way to take one more.
- **Core under `pnpm dev` is `robkit-core serve`**, which adds the apps in `ROBKIT_APPS` it doesn't know, and keeps the access rule of each one it does (`registerApps` in `packages/core/src/apps.ts`). So restarting it with a longer list adds the new app. In a linked checkout it runs under `node --watch`, so stop its whole process group, as the runner does today.
- **A Node stack's `migrate` script is `robkit-migrate`** (ticket 09). It locks the app's own journal table, so the one command that applies a new migration is safe beside a start-up that is still migrating.
- **An app's `.env`** (ticket 17) goes to an added app and to its `migrate` script as it does at start.

### From the ticket round, 2026-11-10

Opus 5.5 and Sol 6.1 read milestone 3's tickets at `a314729`. Both said the control channel needed a real contract, and each had more. I checked each point against the code.

- **A loopback check protects nothing** (Opus, must-change; Sol asked for a token and a fixed set of requests). The ticket had a port on loopback with a token in a state file. Any page in the owner's browser can send a request to `127.0.0.1`, and a name that resolves there gets past a check on the address. Opus offered a socket file as the simpler shape, and I took it: it needs no token, `Host` check, `Origin` check or state file. PRD decision 16 is reworded to match.
- **A request names an operation and a slug, and no more** (both).
- **Ports moved under running apps** (Sol, must-change). `discoverApps` gives each app `firstPort` plus its place in the sorted list.
- **A repeated `add` would provision again** (Sol, must-change), which changes the role's password under a running app.
- **`migrate` uses the credentials the runner holds** (Sol). The command has a name now, `pnpm robkit migrate <slug>` (both), and the bullet no longer assumes `pnpm db:generate`, which the Go stack doesn't have (Sol).
- **Core's restart isn't an exit that stops the runner** (Opus).
- **Running apps answer through the add's install** (Opus), as a criterion.

Not taken:

- **Stable dev passwords, so `robkit add` provisions and migrates by itself** (Opus). Each app's dev password would come from a fixed secret and its slug. It would take migrations off the channel, but the channel is still needed to start and route the app, and it reverses a clause of PRD decision 16 for a saving the owner never sees.
- **A command that starts an added app again after its start failed** (Sol). Starting `pnpm dev` again does that. One more command isn't worth a failure path.
- **A named pipe on native Windows.** Node listens on one with the same call. That belongs to ticket 21, which waits for R, and has a note there.

### From the build

**Chosen in the build, awaiting R's review:**

- **Where the socket is.** `devSocket(root, env)` in `packages/dev/src/requests.ts`, exported from `@robkit/dev/cli`, works it out for the runner and for `askDev`, which `robkit add` and `robkit migrate` call. create-robkit already depends on `@robkit/dev`, so neither side reaches across the layer rule. The folder is `XDG_RUNTIME_DIR`, or `robkit-<uid>` under `os.tmpdir()`. The name is `robkit-<16 hex>.sock`, the first 16 characters of the sha256 of the install's real path. A path of 100 bytes or more stops `pnpm dev` before it starts, with a line that names the variable to point at a shorter folder.
- **Only the runner checks the folder.** It makes it with mode 0700 and refuses one that isn't a folder, that another account owns, or that others can open, each with a line saying what to run. `askDev` just connects, since it sends nothing secret. The tmp folder has the account's uid in its name, so two accounts never share one.
- **A second `pnpm dev` in the same install is refused by its socket**, after ticket 16's checks: "pnpm dev is already running in this install." A socket nothing answers on is removed first.
- **A request with any key beyond `operation` and `slug` is refused**, with the key named. An answer is `{"outcome":"done" | "refused","message":"..."}`.
- **Time limits.** The runner waits 10 seconds for a connection's line. `askDev` waits 10 minutes for the answer, which covers a slow first migration. An added app gets 5 minutes to answer on its port, then the runner stops it and says so.
- **Requests wait for start-up.** One sent while `pnpm dev` is still migrating is answered once every app has started. One sent while it stops is refused.
- **An added app's port** is the first after the proxy's that no running app holds and nothing on `127.0.0.1` listens on.
- **Order of an add:** check the app's `.env`, provision it alone, run its `migrate`, start it, wait for it to answer, restart core, then route it. Until it answers, its exit stops nothing else. After, it counts like any app.
- **Core restarts without a gap.** The new core starts on the first free port after the proxy's, and the proxy moves core's host to it once it answers. Only then does the old core's process group stop. Every app reaches core through the proxy, so no guard sees core gone. Before this, the whole-stack test under load saw a guarded app answer 503 while core restarted. Core's port moves on each add. Nothing but the proxy uses it.
- **A fault while handling a request** prints as a bug, with where to report it, and answers "pnpm dev hit a bug in robkit." It doesn't stop the runner.
- **`robkit add` asks only when the install has `node_modules`.** Without them no app can start, so it prints the old "Next:" lines.
- **`robkit migrate` with no `pnpm dev` running exits 0**, since starting `pnpm dev` migrates every app. A refusal exits 1.

**Tests.** `packages/dev/src/requests.test.ts` and `request-server.test.ts` cover the reader, the folder checks and the server, including a socket left by a SIGKILLed run. `requests.db.test.ts` runs the runner on the fixture install for every add and migrate criterion. `packages/create-robkit/src/dev-requests.test.ts` runs `robkit add` and `robkit migrate` against a stand-in runner on the socket. In the whole-stack test, the global setup makes each journey install without its second app, and `useDevStack` adds it with `pnpm robkit add` once `pnpm dev` is up. A new journey signs a guest in, runs the add while asking the example every 250 ms, then checks the guest's session, the launcher and every app through the proxy. The socket tests skip on native Windows (ticket 21).

**For the next tickets:**

- **19 (robkit upgrade)**: an upgrade that changes a running install should stop `pnpm dev` first, or say to. `askDev(root, request)` answers `not-running` at once when none is, so the upgrade can tell. The request reader refuses any operation but `add` and `migrate`; adding one means a new case in `readDevRequest` and in the runner's `handle`.
- **20 (docs)**: the root README's quickstart, the install's `AGENTS.md` ("Adding and removing apps") and each stack's `AGENTS.md` now say to leave `pnpm dev` running for `robkit add`, and name `pnpm robkit migrate <slug>`. Removing an app still needs a restart. The socket's folder and its refusals are in `packages/dev/README.md`.
