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

**Status:** needs-triage

- [ ] R has answered both questions
- [ ] A vendored install takes a newer robkit from a checkout with one command, and a test holds it
- [ ] A vendored install moves to a released robkit with one command, and a test holds it against the repo's local registry
- [ ] `robkit upgrade`'s line for a vendored install names a step that works
- [ ] "Upgrading robkit" and the deploy guide say how
- [ ] The changeset names create-robkit
