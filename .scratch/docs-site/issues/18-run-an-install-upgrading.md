# 18: Run an install: upgrading

**What to build:** The page on `pnpm robkit upgrade`: what it changes and never changes, what it refuses and why, the two steps in a sentence, the changelog it prints, that Ctrl+C puts the files back, and the commands that undo one stopped any other way.

Until the first release there is nothing to upgrade to, and the page says so with the pre-release line.

**Blocked by:** 03, 05

**Status:** ready-for-agent

- [ ] The undo commands are the ones the install's README gives, shown from the template or held by a test that fails if they differ
- [ ] Each refusal the page names is one the code makes
- [ ] The files the page says upgrade writes are the ones the code writes, and the Proof names where
- [ ] The install's README is among the turbo inputs of the test that reads it
- [ ] The PR's CI `gate` job passes on GitHub
