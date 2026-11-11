# 34: `robkit add` finds `pnpm dev` from any terminal

**What to build:** `pnpm dev` listens on a socket file, and `robkit add`, `migrate` and `upgrade` find it by working out the path the runner worked out: a `robkit-<uid>` folder in `XDG_RUNTIME_DIR`, or in the temp folder where that isn't set ([ticket 18](18-add-while-dev-runs.md)). Two terminals on one machine can disagree about both. A macOS terminal app sets `TMPDIR` to a folder under `/var/folders`, and an ssh session into the same machine may set neither. Milestone 3's code round found this (Opus 5.5, a should-change).

When the two terminals disagree:

- `pnpm robkit add` writes the app and says "Next: pnpm dev" while `pnpm dev` is running.
- `pnpm robkit migrate` says to start `pnpm dev`.
- `pnpm robkit upgrade` runs under a running install, which [ticket 19](19-robkit-upgrade.md) set out to refuse.

What to change:

- **The folder doesn't depend on the terminal.** The runner and the commands work the socket's path out from the account and the install alone, and never from `XDG_RUNTIME_DIR` or `TMPDIR`. So any two terminals of one account agree, with no file to record where the socket is and nothing for a killed run to leave behind.
- **Which folder.** One that is the account's own and that another account can't make first: a folder under the account's home, such as `~/.robkit/run`. The temp folder's fixed path, `/tmp`, is shared, and another account could take `robkit-<uid>` there before the owner does. Choose, and say why in ADR 0020.
- **The same checks.** The runner still makes the folder with mode 0700, and it and the commands still refuse one that isn't a folder, that another account owns, or that others can open (`socketFolderIsOwn`). The socket's name is still a hash of the install's real path, so two installs never share one, and a copy of an install never reaches the original's runner.
- **A path too long for a socket.** A home folder with a long path can pass the limit. The message says so, names the path, and gives the owner a way out that every terminal still agrees on. Say what that is in the ADR.
- **Docs.** The install's `AGENTS.md`, `packages/dev/README.md` and ADR 0020 say where the socket is and why.

Where the socket is belongs to one robkit version: in an install, the runner and the commands come from the same one. So this can ship after 0.1.0 without breaking an install on it.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] With `pnpm dev` running, `robkit add` from a shell whose `XDG_RUNTIME_DIR` and `TMPDIR` differ from the runner's starts the app in the running `pnpm dev`
- [ ] From such a shell, `robkit migrate` migrates in the running `pnpm dev`, and `robkit upgrade` refuses
- [ ] Two installs, one a copy of the other, each reach only their own runner
- [ ] A folder another account owns, or others can open, is refused as today, by the runner and by each command
- [ ] A socket path over the limit stops `pnpm dev` with a message that names the path and what to do
- [ ] Nothing new is written inside the install, so `robkit upgrade`'s clean-tree check is unchanged
- [ ] The install's `AGENTS.md`, `packages/dev/README.md` and ADR 0020 say where the socket is
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### From the lead, 2026-11-10

Opus's review of milestone 3's code raised this, and I confirmed it in `devSocket` in `packages/dev/src/requests.ts`: the folder comes from `env.XDG_RUNTIME_DIR`, or from `os.tmpdir()`, which reads `TMPDIR`. I didn't build it in the round. It adds a file and a lookup to the one channel into `pnpm dev`, which deserves a ticket and a review of its own, and nothing about it freezes at 0.1.0.

A second `pnpm dev` started from such a terminal is already refused: the proxy's port is taken, and the port check runs before the socket is touched.

### From milestone 3, added by the lead

The docs site, built beside this milestone on the `docs-site` branch, has a page on adding an app (docs-site ticket 16) that describes how the `robkit` commands find a running `pnpm dev` today. Say in this ticket's comments what an owner sees differently afterwards. The docs site's last build ticket (26) works from that.

### From the ticket round, 2026-11-11

The ticket first had the runner write its socket's path to a file in `.robkit/`, which the commands read.

Taken:

- Opus: a simpler shape. The two terminals disagree only because the folder comes from variables each terminal sets (`devSocket` in `packages/dev/src/requests.ts`). A folder that doesn't depend on them needs no file.
- Sol: a file that names a socket ties the commands to an account's folder, not to an install. A copy of an install, `.robkit/` and all, would send its commands to the original's runner. With no file, the socket's name stays a hash of the install's real path, and the criteria now test a copied install.

Not needed once there is no file: Sol's rules for writing it in one step, for not following a link, and for removing only the runner's own record.

Chosen by the lead: a folder under the account's home over `/tmp/robkit-<uid>`, which Opus offered first. `/tmp` is shared, so another account can make that folder before the owner does, and the owner's `pnpm dev` would then refuse it for good.

This changes ADR 0020's choice of `XDG_RUNTIME_DIR`. That ADR's status line already says the build's choices await R's review.

Order: this merges after ticket 24, which edits the same section of the install's `AGENTS.md`.
