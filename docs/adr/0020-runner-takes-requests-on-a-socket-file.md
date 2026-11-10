# 0020: The runner takes requests on a socket file

**Status:** decided in the [Just use it PRD](../../.scratch/just-use-it/PRD.md) (decision 16), and built by [Add an app while `pnpm dev` runs](../../.scratch/just-use-it/issues/18-add-while-dev-runs.md), 2026-11-10. What the build chose awaits R's review. The code round of 2026-11-10 added the commands' check of the folder and changed how the runner takes the socket, and this record has both as merged.

## Context

The dev runner read `apps/` and applied migrations once, when it started. So adding an app, or changing a table, meant stopping `pnpm dev` and starting it again. To do either while it runs, `robkit add` and a migrate command have to tell the runner something, and whatever listens for that can be reached by whatever else runs on the owner's machine.

## Decision

`robkit-dev` listens on a Unix socket file, not a port.

- **Why a socket and not a port.** Any web page in the owner's browser can send a request to a port on `127.0.0.1`, and a name that resolves there gets past a check on the address. A port would need a token, a state file to hold it, and `Host` and `Origin` checks. No browser can open a socket file, and the mode of its folder keeps other accounts out. So there is no token and no state file.
- **Where the folder is.** `robkit-<uid>`, in `XDG_RUNTIME_DIR` where that is set, or under the temp folder. It is outside the install, because an install on a Windows drive under WSL can't hold a socket. It is robkit's own folder, with the account's uid in its name, so two accounts never share one. The runner makes it with mode 0700, and refuses one that isn't a folder, that another account owns, or that others can open. `robkit add`, `migrate` and `upgrade` make the same check before they connect, so they ask nothing of a socket another account could have put there. The socket's name is a hash of the install's real path, so two installs don't share one, and the whole path stays under macOS's limit for a socket.
- **What a request can say.** One line of JSON, `{"operation":"add"|"migrate","slug":"<slug>"}`, and nothing else: no command, path, variable or credential. The runner checks the slug by the slug rule and reads the app from `apps/<slug>` itself. It refuses an unknown operation, any other key, a line that isn't JSON, and a line over 1 KB, each with a reason. It handles one request at a time and answers each with one line, and a command reads at most 64 KB of answer.

`devSocket`, `askDev` and `devRunning` in `@robkit/dev/cli` work the path out and talk to it.

## Consequences

- `robkit add` brings a new app up in a running `pnpm dev`, and `pnpm robkit migrate <slug>` applies a new migration without a restart. Neither changes a running app's port or password.
- Nothing answering on the socket means no `pnpm dev` is running, and a second `pnpm dev` in the same install is refused. The runner takes the socket by listening on it, so of two that start together one is refused. It removes a socket file only when the address is in use and nothing answers there, which is what a killed run leaves.
- Removing an app still needs a restart of `pnpm dev`. The install's `AGENTS.md` says so.
- Native Windows has no Unix socket in this shape. Node listens on a named pipe with the same call, which belongs to [ticket 21](../../.scratch/just-use-it/issues/21-native-windows.md), waiting for R.
