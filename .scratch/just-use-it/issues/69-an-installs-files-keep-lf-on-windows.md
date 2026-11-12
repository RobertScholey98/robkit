# 69: An install's files keep LF endings on Windows

**What to build:** An install has no `.gitattributes`, and neither has robkit's repo. Git for Windows ships with `core.autocrlf=true`, so a clone or a checkout made by Windows git gives every text file CRLF endings. Two things then fail:

- `pnpm format:check` fails on every file, since Prettier wants LF.
- `.husky/pre-commit` has CRLF endings, which `sh` won't run.

The docs tell a Windows owner to work in WSL, where git leaves endings alone. But an editor or a coding agent on the Windows side that clones the install, or makes a worktree of it, gets CRLF.

Found on 2026-11-11. The robscholey.com install was made in WSL and cloned by Windows git into a project folder. `compose.yaml`, the `Dockerfile` and the hook all came out with CRLF. I added this file to that install by hand:

```text
* text=auto eol=lf
*.tgz binary
```

- **The base template gets a `.gitattributes`** that keeps LF, so `npm create robkit` writes it into every new install.
- **Decide whether robkit's own repo gets one too.** A contributor on Windows meets the same thing.

**Recommended:** both.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] A new install has a `.gitattributes` that keeps text files LF
- [ ] A test clones a new install with `core.autocrlf=true` and finds LF in the pre-commit hook and in a text file
- [ ] The docs site's tree of an install's files shows it
- [ ] robkit's repo has one too, and its seven files with mixed endings are LF
- [ ] The changeset names create-robkit, and gives the file for an install made before this

## Comments

### Triage, 2026-11-12

R passed the triage of tickets 66 to 70 to a council round and to me. The council was Opus 5.5 and Sol 6.1, both at high, on `main` at `8ae537af`.

- **Both the base template and robkit's repo get the file.** Both reviewers agreed. A template read from a Windows checkout with CRLF endings would be copied into an install as it is.
- **The test clones with `core.autocrlf=true`** (Sol). Listing the file proves it exists, not that it works. A clone with that setting gives CRLF on Linux too, so the test runs in CI.
- **Seven files under `.scratch/quality-hillclimb/research/` have mixed endings** (Opus, confirmed with `git ls-files --eol`). The repo's `.gitattributes` would show them as changed, so they become LF in a commit of their own first.
- **The changeset gives the file for an older install** (both). No command adds it to one.
