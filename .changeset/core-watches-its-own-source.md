---
"@robkit/core": patch
---

In a robkit checkout an install links to, `robkit-core serve` restarts core when the source of a robkit package changes, and no longer when a dependency under `node_modules` does. Node's `--watch` took a dependency's new hard link for a change, and pnpm gives a store file one on every install, so any `pnpm install` on the machine restarted core. An install from npm runs no watcher, as before.
