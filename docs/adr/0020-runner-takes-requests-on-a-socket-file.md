# 0020: The runner takes requests on a socket file

**Status:** decided in the [Just use it PRD](../../.scratch/just-use-it/PRD.md) (decision 16), and built by [Add an app while `pnpm dev` runs](../../.scratch/just-use-it/issues/18-add-while-dev-runs.md), 2026-11-10. What the build chose awaits R's review. The code round of 2026-11-10 added the commands' check of the folder and changed how the runner takes the socket, and this record has both as merged. [Ticket 34](../../.scratch/just-use-it/issues/34-add-finds-dev-from-any-terminal.md) moved the folder into the account's home, 2026-11-11.

## Context

The dev runner read `apps/` and applied migrations once, when it started. So adding an app, or changing a table, meant stopping `pnpm dev` and starting it again. To do either while it runs, `robkit add` and a migrate command have to tell the runner something, and whatever listens for that can be reached by whatever else runs on the owner's machine.

## Decision

`robkit-dev` listens on a Unix socket file, not a port.

- **Why a socket and not a port.** Any web page in the owner's browser can send a request to a port on `127.0.0.1`, and a name that resolves there gets past a check on the address. A port would need a token, a state file to hold it, and `Host` and `Origin` checks. No browser can open a socket file, and the mode of its folder keeps other accounts out. So there is no token and no state file.
- **Where the folder is.** `.robkit/run` in the account's home. The runner and the commands work it out from the account and the install alone, and read nothing else from the terminal, so every terminal of one account finds the same socket. The first build used `XDG_RUNTIME_DIR`, or the temp folder, and two terminals can disagree about both: a macOS terminal app sets `TMPDIR` under `/var/folders`, and an ssh session into the same machine may set neither. `robkit add` then missed a running `pnpm dev`.
- **Why the home and not `/tmp`.** `/tmp` is the same path in every terminal, but every account can write there, so another account could make `/tmp/robkit-<uid>` before the owner does, and the owner's `pnpm dev` would refuse it for good. Only the account can make a folder in its own home. The home comes from `HOME`, which a login sets from the account, or from the account's own entry where `HOME` isn't set.
- **Outside the install.** An install on a Windows drive under WSL can't hold a socket, and `robkit upgrade` checks that the install's tree is clean, so robkit writes nothing new in the install.
- **What is checked.** The runner makes `.robkit` and `run` with mode 0700. It, and `robkit add`, `migrate` and `upgrade` before they connect, refuse either one that isn't a folder, that another account owns, or that others can open. `run` holds the socket, so whoever can open it can ask. `.robkit` holds `run`, so whoever can write there could put another folder in its place. The home itself isn't checked: it is the account's, and a home others can write in is already open to them. A `.robkit` another account owns, as `sudo pnpm dev` can leave when it keeps `HOME`, is refused with a line saying to remove it.
- **A path too long for a socket.** macOS takes no socket path of 104 bytes or more, so robkit keeps under 100. The path is the home plus 34 bytes, so a home of 66 bytes or more is too long. Then `pnpm dev` stops before it starts anything, names the path, and says to make a folder only the owner can open at a shorter path and link `run` to it. A link is on disk, so every terminal agrees on it, where a variable set in one terminal would bring back the fault this decision fixes. Only the account can make the link, since `.robkit` is its alone. The runner checks the folder the link leads to as it checks `run`, puts the socket there, and makes that folder again when it is gone, as a folder in `/tmp` is after a restart.
- **A home on a Windows drive under WSL.** A socket can't live there, and a Windows drive shows every file as mode 777 unless it is mounted with metadata. So `pnpm dev` refuses `.robkit` because others can open it, and starts nothing. WSL makes each account's home on its own disk, so this home is one an owner chose. robkit doesn't support it.
- **A home the account can't write in.** As some system accounts have. `pnpm dev` can't make `.robkit`, stops, names the folder and the system's error code, and says to make the folder with mode 700. If nobody can, that account can't run `pnpm dev`.
- **The socket's name.** A hash of the install's real path, so two installs never share one, and a copy of an install, `.robkit/` and all, never reaches the original's runner.
- **What a request can say.** One line of JSON, `{"operation":"add"|"migrate","slug":"<slug>"}`, and nothing else: no command, path, variable or credential. The runner checks the slug by the slug rule and reads the app from `apps/<slug>` itself. It refuses an unknown operation, any other key, a line that isn't JSON, and a line over 1 KB, each with a reason. It handles one request at a time and answers each with one line, and a command reads at most 64 KB of answer.

`devSocket`, `askDev` and `devRunning` in `@robkit/dev/cli` work the path out and talk to it.

## Consequences

- `robkit add` brings a new app up in a running `pnpm dev`, and `pnpm robkit migrate <slug>` applies a new migration without a restart. Neither changes a running app's port or password.
- Nothing answering on the socket means no `pnpm dev` is running, and a second `pnpm dev` in the same install is refused. The runner takes the socket by listening on it, so of two that start together one is refused. It removes a socket file only when the address is in use and nothing answers there, which is what a killed run leaves.
- Removing an app still needs a restart of `pnpm dev`. The install's `AGENTS.md` says so.
- Native Windows has no Unix socket in this shape. Node listens on a named pipe with the same call, which belongs to [ticket 21](../../.scratch/just-use-it/issues/21-native-windows.md), waiting for R.
