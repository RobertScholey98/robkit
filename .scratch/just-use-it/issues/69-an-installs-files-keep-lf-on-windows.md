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

**Status:** needs-triage

- [ ] A new install has a `.gitattributes` that keeps text files LF, and the test that lists an install's files holds it
- [ ] The docs site's tree of an install's files shows it
- [ ] R has said whether robkit's repo gets one
- [ ] The changeset names create-robkit
