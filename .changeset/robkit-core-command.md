---
"@robkit/core": minor
---

`@robkit/core` ships a `robkit-core` command. `robkit-core start` gives each app its database, migrates core's, then serves core in a process without the provisioning secrets. `robkit-core migrate` migrates, and `robkit-core serve` serves for `pnpm dev`, restarting core on a change to its source in a linked checkout. On SIGTERM core lets open requests finish, prints `core stopped` and exits 0.
