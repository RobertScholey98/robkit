# 0021: Upgrade runs in two steps, with a frozen handover

**Status:** decided in the [Just use it PRD](../../.scratch/just-use-it/PRD.md) (decision 17), and built by [`robkit upgrade`](../../.scratch/just-use-it/issues/19-robkit-upgrade.md), 2026-11-10. The handover's details were chosen in the build, and R reads them before the first release. The code round of 2026-11-10 changed what step 1 moves, and this record has the handover as it merged.

## Context

Platform logic lives in packages so a fix reaches an install by a version bump ([0008](0008-packages-update-apps-are-owned.md), [0016](0016-platform-wiring-lives-in-packages.md)), but nothing did the bump. An owner would have to know which lines of `pnpm-workspace.yaml` are robkit's, and which copied files go with them: the lint policy in `tooling/eslint` and robkit's Go module in `vendor/robkit/go`. The robkit an install already has can't write the new version's copies of those, because it doesn't hold them.

## Decision

`pnpm robkit upgrade` runs in two steps.

1. **The installed robkit** checks everything first, in `upgrade.ts`. Then `handOver`, in `packages/create-robkit/src/upgrade-handover.ts`, sets the catalog's `create-robkit` entry to the new version, installs it, and hands over.
2. **The new robkit** answers `pnpm exec robkit upgrade --finish <old version>`. It raises the catalog's entry for each of robkit's other packages, and writes what only it holds: the lint policy, the Go module where the install has a Go app, any catalog entry its packages need, and a newer `packageManager`. This is `finishUpgrade` in `upgrade.ts`.

The handover is frozen. Once 0.1.0 is on npm, its step 1 calls step 2 of every later robkit for as long as anyone upgrades from it, so the call, its one argument and the state step 1 leaves are public, like an export. `upgrade-handover.ts` says so in its first comment, and `upgrade-handover.test.ts` checks the file's sha256, so an edit fails the build until someone means it. To change step 1 after 0.1.0, copy the file and leave this one for the test.

The details frozen with it, from ticket 19's comments under "The handover, as 0.1.0 will ship it":

- Step 1 calls `pnpm exec robkit`, not `pnpm robkit`, since the install's `robkit` script is the owner's to rename.
- Step 1 moves `create-robkit` alone in the catalog, and installs with `--no-frozen-lockfile`. Every `@robkit/*` entry stays at the old version until step 2 raises it. Step 1 names no other package, so a later robkit can drop or rename one, and an install on 0.1.0 can still upgrade to it.
- Ctrl+C stops the command step 1 is running and not step 1, which then puts the files back as it does for any failure.
- Step 2 exits non-zero when it fails, and step 1 then puts the files back.
- A file goes back with `git checkout HEAD --` and `git clean -fdq --` on five paths: `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `package.json`, `tooling/eslint` and `vendor/robkit/go`. Both steps do it, and doing it twice changes nothing.
- The checks live in `upgrade.ts`, outside the frozen file.
- The file imports only `node:` modules, `yaml`, and `exec` and `CommandProblem` from `@robkit/dev/cli`, and loads nothing after `pnpm install`.

## Consequences

- Upgrade refuses a tree with uncommitted changes, a version that isn't newer, a link at or above any path it writes, and a running `pnpm dev`. So git shows the owner everything it did, and `git diff` is the review.
- It never rewrites an app, the hub or admin. It prints create-robkit's changelog between the two versions, where a change the owner must make by hand is written ([0019](0019-one-version-a-pull-request-and-a-button.md)).
- A later robkit can't add a check for an install on 0.1.0, since 0.1.0's checks are in its own `upgrade.ts`. Only step 2 can refuse.
- The first release waits for this, and its runbook reads the frozen file once more before it.
