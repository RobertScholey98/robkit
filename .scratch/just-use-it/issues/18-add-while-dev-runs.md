# 18: Add an app while `pnpm dev` runs

**What to build:** The README tells a new owner to stop `pnpm dev` before `pnpm robkit add` and start it again after. The runner reads `apps/` once, when it starts, and applies migrations once, when it starts. So adding an app, or changing a table, means a restart. Neither should.

- **The runner can be told things, over a socket file.** `robkit-dev` listens on a Unix socket, not a port. Any web page can send a request to a port on `127.0.0.1`, so a port would need a token, a `Host` check and an `Origin` check to be safe. No browser can open a socket file, and the mode of its folder keeps other users out. So there is no token and no state file.
- **Where the socket is.** Outside the install, since an install on a Windows drive under WSL can't hold one. It sits in a folder only the owner can open, which the runner makes with mode 0700: in `XDG_RUNTIME_DIR` where that is set, or under `os.tmpdir()`. The runner refuses a folder another user owns or that others can open. The socket's name comes from a hash of the install's real path, so two installs don't share one, and the `robkit` command works the same path out. The whole path stays under 100 bytes, since macOS takes no longer one for a socket.
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
- [x] The PR's CI `gate` job passes on GitHub

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

- **Where the socket is.** `devSocket(root, env)` in `packages/dev/src/requests.ts`, exported from `@robkit/dev/cli`, works it out for the runner and for `askDev`, which `robkit add` and `robkit migrate` call. create-robkit already depends on `@robkit/dev`, so neither side reaches across the layer rule. The folder is `robkit-<uid>`, in `XDG_RUNTIME_DIR` or under `os.tmpdir()`. The name is `robkit-<16 hex>.sock`, the first 16 characters of the sha256 of the install's real path. A path of 100 bytes or more stops `pnpm dev` before it starts, with a line that names the variable to point at a shorter folder.
- **Only the runner checks the folder.** It makes it with mode 0700 and refuses one that isn't a folder, that another account owns, or that others can open, each with a line saying what to run. `askDev` just connects, since it sends nothing secret. The folder has the account's uid in its name, so two accounts never share one.
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

**Tests.** `packages/dev/src/requests.test.ts` and `request-server.test.ts` cover the reader, the folder checks and the server, including a socket left by a SIGKILLed run. `requests.db.test.ts` runs the runner on the fixture install for every add and migrate criterion. `packages/create-robkit/src/dev-requests.test.ts` runs `robkit add` and `robkit migrate` against a stand-in runner on the socket. In the whole-stack test, the global setup makes each journey install without its second app, and `useDevStack` adds it with `pnpm robkit add` once `pnpm dev` is up. A new journey signs a guest in, runs the add while asking the example every 250 ms, then checks the guest's session, the launcher and every app through the proxy. The example must answer every time, which a 502 from the proxy would deny. Its guard may answer 503: under a loaded full gate (load average 44) it timed out asking core during the add's `pnpm install`, before core restarted. That core answers all through the restart is checked in `requests.db.test.ts`, every 20 ms. The socket tests skip on native Windows (ticket 21).

**For the next tickets:**

- **19 (robkit upgrade)**: an upgrade that changes a running install should stop `pnpm dev` first, or say to. `askDev(root, request)` answers `not-running` at once when none is, so the upgrade can tell. The request reader refuses any operation but `add` and `migrate`; adding one means a new case in `readDevRequest` and in the runner's `handle`.
- **20 (docs)**: the root README's quickstart, the install's `AGENTS.md` ("Adding and removing apps") and each stack's `AGENTS.md` now say to leave `pnpm dev` running for `robkit add`, and name `pnpm robkit migrate <slug>`. Removing an app still needs a restart. The socket's folder and its refusals are in `packages/dev/README.md`.

### From the lead's read of the pull request, 2026-11-10

I read all of PR 96 and changed three things on its branch before it merged.

- **The socket's folder is robkit's own in `XDG_RUNTIME_DIR` too.** The build kept the socket directly in `XDG_RUNTIME_DIR` and refused to start when others could open that folder. Under WSL without systemd it is `/mnt/wslg/runtime-dir`, which is mode 777 on R's machine, so `pnpm dev` would have stopped there and said to `chmod` a folder the system owns. Every test set the variable to a new private folder, so none saw it. The runner now makes `robkit-<uid>` there with mode 0700, as it did in the temp folder, and checks that one. The ticket's text above says so now.
- **A folder the runner can't make is the owner's to fix.** It was reported as a bug in robkit. Now it is one line that names the folder and the variable to change. This is what an account sees after `su`, when `XDG_RUNTIME_DIR` still names the first account's folder.
- **The add journey fails on any answer but 401 or 503.** It failed only on a 502.

Checked and left as built:

- **The 503 the journey allows.** The example's guard answers 503 when core takes longer than its wait. Under a loaded gate that happened while `pnpm install` ran, before core restarted. The runner's own test asks core through the proxy every 20 ms during an add and gets an answer every time.
- **Each whole-stack request on a connection of its own.** Node's client was handing out a kept-alive connection the proxy had just closed. A browser sends such a request again by itself.

### Merged

Added by the lead. PR 96 merged into `m3-making-an-install` on 2026-11-10 as `9c50ccef`, with `gate`, `check` and `pull-request` green on `591dcd60`.

That run was the first full gate to pass on the whole branch. The build's five runs in WSL each lost tests to load on the machine. CI's run on the build's last commit, `69343381`, was cancelled when I pushed my commits on top.

### From the code round, 2026-11-10

Milestone 3's code had its one council round at `8bca5524`. Opus 5.5 gave it 7 out of 10 and Sol 6.1 gave 7, and neither would merge it as it stood. I checked each finding against the code before I acted on it. These are the ones about this ticket.

Taken, each in a commit of its own with a test that failed first:

- **The commands check the socket's folder, as the runner does** (Opus, must-change). `robkit add`, `migrate` and `upgrade` connected to whatever listened at the path. Where every account can write the folder above it, another account could make `robkit-<uid>` first and answer in the runner's place. `socketFolderIsOwn` in `requests.ts` is now the one check, and the runner and the commands all call it. An answer over 64 KB with no line break is a fault.
- **Two runners that start together can't both take the socket** (Sol, must-change). The runner asked whether the socket answered, removed the file, then listened. A second runner could remove the first one's live socket between those steps. The runner now listens first. When the address is in use, it asks whether something answers there. If something does, it refuses as a second `pnpm dev`. If nothing does, a killed run left the file, and it removes the file and listens again.
- **Stopping `pnpm dev` stops a migration that is running** (Sol, must-change). The stop waited for the request in hand, and a migration that waits on a lock never ends. `exec` from `@robkit/dev/cli` takes a `signal`, and stops the command and every process it started when the signal aborts. The runner passes its stop signal to each migration: at start, in an add and in `robkit migrate`.
- **A new core that doesn't come up leaves the old one serving** (Sol, must-change, and Opus as a should-change). An add started the new core with no time limit, and its exit stopped the whole install. The new core now counts for nothing until it answers. When it exits, or stays silent for five minutes, the runner stops it, keeps the core it had, stops the added app and refuses the add with the reason.
- **A failed migration says where its output is** (Opus, must-change). `robkit migrate` ended "Its output is above", and the output is in `pnpm dev`'s terminal. It now ends "Its output is in pnpm dev's."

Not taken:

- **Stop what an exited launcher left running** (Sol, must-change). When an added app's `dev` script exits before the app answers, the runner drops the app without stopping its processes, and Sol asked for a stop there. I wrote the test and the call, and the test still failed. pnpm 11.28.9 runs a package's script in a session and process group of its own. While pnpm lives, stopping pnpm's process group makes pnpm stop the script's. Once the script has exited, pnpm has gone too, and a process the script left behind is in a process group the runner was never told. I checked that with a script that prints each process's group under `pnpm run`. The runner holds nothing that names such a process, for an added app or for one that exits at start, so I took the call and the test out.
- **The socket is found the same from every terminal** (Opus, should-change). The path comes from `XDG_RUNTIME_DIR` or the temp folder, and two terminals on one machine can disagree about both. `robkit add` then says "Next: pnpm dev" while `pnpm dev` runs. Opus's fix is sound: the runner writes the socket's path into `.robkit/`, and the commands read it there. In an install the runner and the commands are the same robkit version, so where the socket is can change after 0.1.0. [Ticket 34](34-add-finds-dev-from-any-terminal.md) holds it, in milestone 4.
- **The 503 the add journey allows** (Sol, a note). Sol is right that the journey proves less than "every app keeps answering". The proof is the runner's own test, which asks core through the proxy every 20 ms during an add. This round added two more beside it: a new core that exits, and one that never answers.
