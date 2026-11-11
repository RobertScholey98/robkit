# 34: `robkit add` finds `pnpm dev` from any terminal

**What to build:** `pnpm dev` listens on a socket file, and `robkit add`, `migrate` and `upgrade` find it by working out the path the runner worked out: a `robkit-<uid>` folder in `XDG_RUNTIME_DIR`, or in the temp folder where that isn't set ([ticket 18](18-add-while-dev-runs.md)). Two terminals on one machine can disagree about both. A macOS terminal app sets `TMPDIR` to a folder under `/var/folders`, and an ssh session into the same machine may set neither. Milestone 3's code round found this (Opus 5.5, a should-change).

When the two terminals disagree:

- `pnpm robkit add` writes the app and says "Next: pnpm dev" while `pnpm dev` is running.
- `pnpm robkit migrate` says to start `pnpm dev`.
- `pnpm robkit upgrade` runs under a running install, which [ticket 19](19-robkit-upgrade.md) set out to refuse.

What to change:

- **The runner records where its socket is.** Once it listens, it writes the socket's path to a file in the install's `.robkit/` folder, which git already ignores, and removes the file when it stops. The socket itself stays outside the install, since an install on a Windows drive under WSL can't hold one. A plain file is fine there.
- **The commands read that file first.** `askDev` and `devRunning` use the path it gives, and work the path out as today when the file is missing.
- **The path in the file gets no more trust than one worked out.** The commands check the folder it names with `socketFolderIsOwn`, as they do now. The install's files are the owner's, so the file adds no way in that editing the install's code doesn't already give.
- **A file a killed run left is harmless.** Nothing answers at its path, which already means no `pnpm dev` is running. The next `pnpm dev` writes over it.

Where the socket is belongs to one robkit version: in an install, the runner and the commands come from the same one. So this can ship after 0.1.0 without breaking an install on it.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] With `pnpm dev` running, `robkit add` from a shell whose `XDG_RUNTIME_DIR` and `TMPDIR` differ from the runner's starts the app in the running `pnpm dev`
- [ ] From such a shell, `robkit migrate` migrates in the running `pnpm dev`, and `robkit upgrade` refuses
- [ ] The file is gone once `pnpm dev` has stopped, and a file a killed run left reads as no `pnpm dev` running
- [ ] A file that names a socket in a folder another account owns, or others can open, is refused as such a folder is today
- [ ] `git status` in the install shows nothing for the file, so `robkit upgrade`'s clean-tree check is unchanged
- [ ] The install's `AGENTS.md`, `packages/dev/README.md` and ADR 0020 say how the commands find the socket
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### From the lead, 2026-11-10

Opus's review of milestone 3's code raised this, and I confirmed it in `devSocket` in `packages/dev/src/requests.ts`: the folder comes from `env.XDG_RUNTIME_DIR`, or from `os.tmpdir()`, which reads `TMPDIR`. I didn't build it in the round. It adds a file and a lookup to the one channel into `pnpm dev`, which deserves a ticket and a review of its own, and nothing about it freezes at 0.1.0.

A second `pnpm dev` started from such a terminal is already refused: the proxy's port is taken, and the port check runs before the socket is touched.

### From milestone 3, added by the lead

The docs site, built beside this milestone on the `docs-site` branch, has a page on adding an app (docs-site ticket 16) that describes how the `robkit` commands find a running `pnpm dev` today. Say in this ticket's comments what an owner sees differently afterwards. The docs site's last build ticket (26) works from that.
