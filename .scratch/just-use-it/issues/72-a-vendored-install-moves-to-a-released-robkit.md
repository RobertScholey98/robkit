# 72: A vendored install moves to a released robkit

**What to build:** Split from [ticket 70](70-a-vendored-install-can-take-a-newer-robkit.md) on 2026-11-12. Once robkit is on npm, an install that runs the tarballs `robkit vendor` packed has no way onto the registry. `robkit upgrade` stops at any override that names a file (`notFromRegistry` in `packages/create-robkit/src/upgrade.ts`). The deploy guide tells every owner who deploys before the release to vendor, so each of those installs ends up here.

- **One command moves the install to a released robkit.** It removes robkit's overrides, moves every robkit entry in the catalog to the released version, installs, and then removes the tarballs.

What the council round on ticket 70 found, each checked in the code:

- **The catalog holds every robkit package at the vendored version**, 0.0.0 before the release (`generate.ts`). `handOver` moves only create-robkit's entry (`upgrade-handover.ts`). With the overrides gone, `pnpm install` would ask the registry for `@robkit/core@0.0.0`, which it doesn't have. So the overrides and every robkit entry move together.
- **A failure leaves a vendored install that works.** `putBack` restores the paths in `ownedPaths`, and the tarballs aren't among them. So the tarballs go last, once the install has succeeded.
- **`vendor/robkit/go` stays.** A Go app builds against it on npm too.
- **Overrides that aren't robkit's stay.**
- **`upgrade-handover.ts` freezes when 0.1.0 is on npm**, and its first step names no package but create-robkit, so a later robkit can drop or rename any other.

**Recommended:** the released robkit does the move in one step, and no handover is involved. Only it knows which packages it has and at what version. `robkit upgrade` in a vendored install asks the registry whether it has the running robkit's own version. If it has, the command moves the install to that version. If it hasn't, the command prints how to run a released robkit in the install, such as with `pnpm dlx`. That leaves `upgrade-handover.ts` alone, and it works for an install vendored before this code existed, the robscholey.com install included. The builder proves the command against the repo's local registry before the docs name it.

**Blocked by:** 70

**Status:** ready-for-agent

- [ ] A vendored install moves to a released robkit with one command, and a test holds it against the repo's local registry
- [ ] The test's install was vendored by a robkit without this code, as robscholey.com was
- [ ] A move that fails at `pnpm install` leaves the overrides, the catalog and the tarballs as the last commit has them, and a test holds it
- [ ] After the move, `vendor/robkit` holds no tarball, a Go app's `vendor/robkit/go` is still there, and an override that isn't robkit's is unchanged
- [ ] `robkit upgrade` in a vendored install whose robkit the registry doesn't have prints a command that works
- [ ] "Upgrading robkit" says how
- [ ] The changeset names create-robkit
