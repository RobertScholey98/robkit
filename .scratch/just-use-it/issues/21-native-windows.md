# 21: `pnpm dev` on native Windows

**What to build:** An install runs on Linux, macOS, or WSL on Windows. On native Windows `pnpm dev` fails: the runner spawns `pnpm` without a shell, stops apps by process group, and some template scripts use POSIX forms. Docker Desktop runs the same Compose file on Windows, so Postgres isn't the obstacle.

**Blocked by:** 16

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
