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

**Status:** done

- [x] A new install's first commit is on `main`, whatever `init.defaultBranch` says and with none set, and a test holds it
- [x] The commands `robkit upgrade` prints for an install with no commit end on `main` too
- [x] The changeset names create-robkit

## Comments

### Triage, 2026-11-12

R passed the triage of tickets 66 to 70 to a council round and to me. The council was Opus 5.5 and Sol 6.1, both at high, on `main` at `8ae537af`.

- **`main`, always.** Both reviewers agreed.
- **Set the branch with `git symbolic-ref HEAD refs/heads/main` after `git init`** (Opus). `git init --initial-branch` needs git 2.28, and Ubuntu 20.04 ships 2.25. `symbolic-ref` works on every git.
- **`robkit upgrade`'s commands for an install with no commit end on `main` too** (Opus, `commitCommands` in `upgrade.ts`). It prints them for an install with no commit, such as one made with `--no-install`, and a bare `git init` gives `master` again. `git branch -M main` after the commit works on every git.
- The test sets `init.defaultBranch` through `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_0` and `GIT_CONFIG_VALUE_0`, and runs once more with none set (both).

### Chosen in the build, 2026-11-12

- `startGit` runs `git symbolic-ref HEAD refs/heads/main` straight after `git init --quiet`. A failure of either gives the same one line as before, naming the command.
- No doc or message told an owner to run a bare `git init` but `robkit upgrade`'s, which now ends with `git branch -M main`.
- I reproduced it with the new test before the fix. With no default branch set the first commit was on `master`, and with `init.defaultBranch=trunk` it was on `trunk`.

### Proof

- In WSL (Ubuntu 22.04, Node 24, git 2.34), `set-up.test.ts` passes all 12, the two new ones among them, and `upgrade.test.ts`'s two tests of the commands for an install with no commit pass with the new line.
