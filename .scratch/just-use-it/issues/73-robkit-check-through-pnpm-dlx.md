# 73: `robkit check` through `pnpm dlx` fails

**What to build:** The worker on [ticket 72](72-a-vendored-install-moves-to-a-released-robkit.md) saw this on 2026-11-12, in a vendored install against the repo's local registry. Nobody has reproduced it since.

```sh
pnpm dlx --package create-robkit@0.0.1 robkit check
```

It failed with `ERR_MODULE_NOT_FOUND`. In the same install, `pnpm dlx --package create-robkit@0.0.1 robkit upgrade` worked, and that is the one command the docs tell an owner to run through `pnpm dlx`.

- **Reproduce it, and name the module it can't find.** `tooling/e2e/src/vendored-upgrade.test.ts` makes the install and the registry.
- **Decide what a robkit run through `pnpm dlx` supports.** Either every command works there, or the others say to run the install's own robkit.

**Recommended:** find the cause first. If `check` loads something from the install that `pnpm dlx` can't reach, have the other commands say so in one line.

**Blocked by:** none

**Status:** needs-triage

- [ ] The failure is reproduced, and the ticket names the module
- [ ] R has said whether every command should work through `pnpm dlx`
- [ ] A test holds whichever R chooses
