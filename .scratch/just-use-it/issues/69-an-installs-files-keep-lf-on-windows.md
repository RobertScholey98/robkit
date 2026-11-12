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

**Status:** done

- [x] A new install has a `.gitattributes` that keeps text files LF
- [x] A test clones a new install with `core.autocrlf=true` and finds LF in the pre-commit hook and in a text file
- [ ] The docs site's tree of an install's files shows it (the site has no such tree, see below)
- [x] robkit's repo has one too, and its seven files with mixed endings are LF
- [x] The changeset names create-robkit, and gives the file for an install made before this

## Comments

### Triage, 2026-11-12

R passed the triage of tickets 66 to 70 to a council round and to me. The council was Opus 5.5 and Sol 6.1, both at high, on `main` at `8ae537af`.

- **Both the base template and robkit's repo get the file.** Both reviewers agreed. A template read from a Windows checkout with CRLF endings would be copied into an install as it is.
- **The test clones with `core.autocrlf=true`** (Sol). Listing the file proves it exists, not that it works. A clone with that setting gives CRLF on Linux too, so the test runs in CI.
- **Seven files under `.scratch/quality-hillclimb/research/` have mixed endings** (Opus, confirmed with `git ls-files --eol`). The repo's `.gitattributes` would show them as changed, so they become LF in a commit of their own first.
- **The changeset gives the file for an older install** (both). No command adds it to one.

### Chosen in the build, 2026-11-12

- `.gitattributes` needs no `storedAs` entry. `npm pack --dry-run` of create-robkit lists `templates/base/.gitattributes`, so npm keeps it.
- The docs site has no tree of an install's files. `site/src/content/docs` names neither `.prettierignore` nor `.dockerignore` in a list of files. So the install's own `AGENTS.md` says what `.gitattributes` does instead, in its Husky and lint-staged item. A tree on the site would be new work, for a later ticket.
- The changeset tells the owner of an older install to add the file, run `git add --renormalize .` and commit.
- The seven research notes each had a few CRLF lines. I made them LF in a commit of their own. With the root file added, `git add --renormalize .` stages nothing else.
- I reproduced it with the new test before the fix. In a clone made with `core.autocrlf=true`, `.husky/pre-commit` and `compose.yaml` both had CR bytes.

### Proof

- In WSL (Ubuntu 22.04, Node 24, git 2.34), `line-endings.test.ts` fails without the template's file and passes with it.
- create-robkit's lint, typecheck and all 545 tests pass, with coverage over its thresholds. `pnpm format:check`, `pnpm knip` and the glossary check pass.
- In robkit's repo, `git status` is clean and `git ls-files --eol` shows no `mixed` and no `crlf` in the index.
