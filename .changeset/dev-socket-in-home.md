---
"@robkit/dev": minor
"create-robkit": patch
---

`pnpm dev` keeps its socket in `~/.robkit/run`, so `pnpm robkit add`, `migrate` and `upgrade` find a running `pnpm dev` from any terminal. Before, the folder came from `XDG_RUNTIME_DIR` or `TMPDIR`, and a terminal that set them differently missed it: `robkit add` said to start `pnpm dev`, and `robkit upgrade` ran under a running install. Stop `pnpm dev` before you upgrade, then start it again.

If your home's path is too long for a socket, `pnpm dev` says so and names the path. Make a folder only you can open at a shorter path and link `~/.robkit/run` to it.

`DevSocket` from `@robkit/dev/cli` has `parent` in place of `setBy`.

The install's `AGENTS.md` says where the socket is now. `robkit upgrade` doesn't rewrite that file, so change the line under "Adding and removing apps" by hand if you want it to match.
