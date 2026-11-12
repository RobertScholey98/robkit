# 70: A vendored install can take a newer robkit

**What to build:** `robkit vendor` packs robkit's packages into an install made with `--link`, and points its overrides at the tarballs. From then on the install has no way to a newer robkit:

- `robkit upgrade` has nothing to move, and names a step: "Vendor again from a newer robkit checkout to update them."
- `robkit vendor` refuses that step, since no override is a link any more: "This install doesn't link to a robkit checkout, so there is nothing to vendor. Make it with --link."

The one way through is to edit `pnpm-workspace.yaml` by hand, back to links, and vendor again. No doc says so.

It has no way onto npm either. Once robkit is released, `robkit upgrade` in a vendored install still prints the line above, because it stops at any override that names a file (`notFromRegistry` in `packages/create-robkit/src/upgrade.ts`). The deploy guide's step 10 tells every owner who deploys before the release to vendor, so each of those installs ends up here.

Found on 2026-11-11. The robscholey.com install is vendored from `main` at `0e94a5cd`, so that it works from both Windows and WSL, and so it can deploy.

**Questions for R:**

1. **Before the release, how does a vendored install take a newer robkit?**
   - **`robkit vendor` takes the checkout to pack from** (recommended), as an option such as `--from ../robkit`. It packs again and replaces the tarballs, whether the install links or not.
   - **A documented hand edit.** No new code, and a step most owners will get wrong.
2. **After the release, how does it move to npm?**
   - **`robkit upgrade` does it** (recommended). Given a version the registry has, it removes the overrides and the tarballs, and moves the catalog to that version.
   - **A documented hand edit**, as above.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] A vendored install takes a newer robkit from a checkout with one command, `robkit vendor --from <checkout>`, and a test holds it
- [ ] A second run from a checkout whose code changed and whose version didn't puts the new code in `node_modules`, and `pnpm install --frozen-lockfile` passes after it
- [ ] A run leaves no tarball in `vendor/robkit` that no override names
- [ ] `robkit upgrade`'s line for a vendored install names a step that works
- [ ] "Upgrading robkit" and both copies of the deploy guide say how, with the first step for an install vendored before this
- [ ] The changeset names create-robkit

## Comments

### Triage, 2026-11-12

R passed the triage of tickets 66 to 70 to a council round and to me. The council was Opus 5.5 and Sol 6.1, both at high, on `main` at `8ae537af`.

- **Question 1: `robkit vendor --from <checkout>`.** Both reviewers agreed.
- **Question 2 is now [ticket 72](72-a-vendored-install-moves-to-a-released-robkit.md).** Both agreed that `robkit upgrade` should do it, and both found that the design here would ship broken. Opus asked for the split. This ticket keeps what an owner needs before the release.
- **An install vendored before this has a robkit with no `--from`** (both). The docs give its first step, which runs the checkout's robkit from inside the install: `node <checkout>/packages/create-robkit/src/robkit-command.ts vendor --from <checkout>`.
- **Every tarball keeps its name while robkit's version is 0.0.0** (both, `tarballOf` in `vendor.ts`). So the test proves the new code reaches `node_modules` and that a frozen install passes afterwards. Rewritten tarballs alone prove neither.
- **A run removes the tarballs no override names.** A checkout on a new version would otherwise leave the old version's tarballs beside the new ones.
- Not taken: dropping the override of a package the newer checkout no longer has (Opus). The run already stops and names that package, and the install's apps would still depend on it.
