# 33: Core restarts only when robkit's source changes

**What to build:** In a robkit checkout an install links to, `robkit-core serve` runs core under `node --watch`, so a contributor's edit to robkit's source restarts core. Node watches every file core imports, and that includes its dependencies under `node_modules`. pnpm hard-links those files from its store, and Node takes a file's new hard link, or a lost one, for a change. So every `pnpm install` on the machine restarts core, and so does removing any install, whether or not it has anything to do with this checkout. While core restarts, the dev proxy answers 502.

The whole-stack tests make and remove installs side by side, each with its own core, so this is a cause of their "core is not answering" failures. It failed pull request 94's CI: the Next journey got a 502 from `core.robkit.localhost/refresh` while core restarted for `toidentifier/index.js` and then for a file of hono's.

- **Core watches robkit's own source.** `serve` starts Node with `--watch-path` for the source folder of each package in the checkout, core's among them. With `--watch-path`, Node watches those folders and not the files core imports.
- **An install from npm runs no watcher**, as today.

**Blocked by:** none

**Status:** done

- [x] In a checkout, core restarts when a file of its source changes
- [x] Core keeps serving, with no restart, when a dependency under `node_modules` gains a hard link
- [x] The folders core watches are the source of each robkit package, and none is under `node_modules`
- [x] A packed or vendored install still runs no watcher
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### From the lead, who found and built it, 2026-11-10

**How I found it.** Pull request 94's `check` failed in `next.test.ts`, "guards the example app with its own token", on a 30-second wait for the page after the refresh bounce. The journey's own log had the cause: a 502 from core's `/refresh`, and beside it `pnpm dev` printing `Change detected in '.../node_modules/.pnpm/toidentifier@1.0.1/node_modules/toidentifier/index.js'` and `Restarting '.../packages/core/src/serving.ts'`. Nothing had edited that file. In the two green runs before it, the same test took 8 seconds.

**What I checked in WSL, on Node 24.22.2:**

- A program run with `node --watch` restarts when a file it imports gains a hard link from any folder, loses one, or has its times or mode set through another link. A new file beside it restarts nothing.
- A program that imports hono restarts when `hono/dist/index.js` gains a hard link. That file had 68 links on this machine, one for each install that shares pnpm's store.
- With `--watch-path=src`, a hard link to a dependency outside `src` restarts nothing, an edit to a file two folders down in `src` restarts, and a hard link to a file in `src` restarts nothing.

**Chosen in the build:**

- **Every package's source folder is watched**, not only the ones core imports. Working out which packages core imports would mean reading manifests at start, and an edit to a package core doesn't import costs one restart nobody asked for.
- **The folder's name comes from core's own file**: `src` in a checkout. The function reads `packages/` beside core's own package, and keeps each package that has that folder.
- **The test of the hard link waits two seconds for a restart that must not come**, then makes a change that must restart core. Node waits a moment after a change before it restarts, and takes a second change in that moment for the same one, so the two changes can't sit side by side. Before the fix the test failed three runs of three, and after it passed three of three.

**Not done here:**

- `packages/core/src/robkit-core.db.test.ts` sets the times of `serve-core.ts` in the checkout itself, which restarts every linked core running on the machine at that moment. Core's tests finish before the whole-stack tests start, so it hasn't bitten.
- The workers' reports of "core is not answering" under load on 2026-11-10 fit this cause, but I didn't go back and check each one.
