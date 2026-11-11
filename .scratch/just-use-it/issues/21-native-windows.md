# 21: `pnpm dev` on native Windows

**What to build:** An install runs on Linux, macOS, or WSL on Windows. On native Windows `pnpm dev` fails: the runner spawns `pnpm` without a shell, stops apps by process group, and some template scripts use POSIX forms. Docker Desktop runs the same Compose file on Windows, so Postgres isn't the obstacle.

**Blocked by:** 16, 18

**Status:** needs-info

**Open:**

- Should `pnpm dev`, `npm create robkit` and `robkit add` work on native Windows with Docker Desktop? R said on 2026-11-09 that Docker stays, which this ticket keeps, but didn't say whether WSL should stay required.

  Recommended: yes. Next.js and Create React App run on native Windows, and "use WSL" is the first thing a Windows owner would otherwise read. The cost is a Windows job in CI for the fast gate and one install smoke test, and keeping the runner's process handling working on two systems.

**If yes, the criteria would be:**

- [ ] `npm create robkit`, `pnpm dev` and `pnpm robkit add` work in PowerShell with Docker Desktop
- [ ] Ctrl+C and closing the terminal stop every app and Postgres
- [ ] No template script uses a form that only a POSIX shell runs
- [ ] CI runs the fast gate and one install's start-up on Windows
- [ ] The README drops "On Windows, run everything in WSL"

## Comments

Found while milestone 1 was built (2026-11-09):

- Ticket 26 leases each block of test ports with a symlink (`tooling/test-postgres/src/index.ts`). Windows makes a symlink only with Developer Mode on or as an administrator. It works on R's machine. On a Windows machine without Developer Mode, test-postgres's own tests would fail in the fast gate. If R says yes to native Windows, the lease needs another atomic file there, such as one made with the `wx` flag.

Found while milestone 2 was built (2026-11-10):

- Ticket 10 took the `VAR=value` prefix out of the Next template's `dev` script, which only a POSIX shell runs. I haven't checked the other template scripts for forms like it. What is known to be left is in the runner: it spawns `pnpm` without a shell (`packages/dev/src/runner.ts`), and `stopGroup` signals a negative pid (`packages/dev/src/process-group.ts`), which Windows doesn't have.

From milestone 3's ticket round (2026-11-10), for whoever builds this if R says yes:

- **Say which this covers.** An install an owner makes on Windows is one thing. A contributor running robkit's own fast gate on Windows is another, with its own faults (the symlink above, two test files that fail there today). The question above is about the first.
- **GitHub's Windows runners run Windows containers only**, so the install's Compose file, which starts a Linux Postgres, can't run in a Windows job. With `ROBKIT_DATABASE_URL` set the runner uses that database, and it should then start no Compose at all. A Windows job needs a Postgres the runner can reach, such as the PostgreSQL that GitHub's Windows image has installed.
- **Node refuses to spawn a `.cmd` file without a shell**, and `pnpm` on Windows is one.
- **Stopping an app's whole tree** on Windows is `taskkill /T /F`, where the runner signals a process group.
- **Closing the terminal** has no SIGHUP on Windows. Say what does stop the apps there.
- **Ticket 18's socket file** is a named pipe on Windows. Node listens on one with the same call, and its path and who may open it need their own rule. This ticket now waits for 18.

From milestone 4's ticket round (2026-11-11), moved here from ticket 25's comments:

- **A port lease whose holder and watcher were both killed is never taken back** (`freePortBlock` in `tooling/test-postgres/src/index.ts`). A reboot or `wsl --shutdown` leaves every lease of that moment behind, and with enough of them 50 random tries over 500 blocks start to fail. It never reaches CI, where each run gets a fresh machine, so both reviewers said it isn't ticket 25's. A lease named for its block and its holder's pid needs no removal to be ignored, and needs no symlink, which this ticket wants gone too.
