# 67: An install's first commit is on `main`

**What to build:** `npm create robkit` runs `git init --quiet` (`startGit` in `packages/create-robkit/src/set-up.ts`). The first commit lands on whatever git's `init.defaultBranch` says, and on `master` where git has no setting.

The install's own files expect `main`:

- `.github/workflows/ci.yml` runs on pushes to `main`, and deploys from it.
- `docs/deploy.md` gives `"branch": "main"` in `coolify.json`, and says to push to `main`.

Found on 2026-11-11, making the robscholey.com install in WSL, where git had no default set. The install came out on `master`, and I renamed the branch by hand.

**Question for R:**

1. **Which branch does a new install start on?**
   - **`main`, always** (recommended). Pass `--initial-branch=main` to `git init`. The workflow and the deploy guide are then right in every new install. An owner who wants another name renames the branch and changes the workflow together.
   - **Whatever git says**, with the workflow and the docs written to match. It respects the owner's setting, and costs a template that takes the branch's name in three places.

**Blocked by:** none

**Status:** needs-triage

- [ ] R has answered the question
- [ ] A new install's first commit is on the branch its workflow and its deploy guide name, whatever `init.defaultBranch` says, and a test holds it
- [ ] The changeset names create-robkit
