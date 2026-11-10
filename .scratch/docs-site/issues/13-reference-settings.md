# 13: Reference: every setting

**What to build:** One page listing every setting an owner or a builder can set: the install's dev settings, what the runner sets for each app, what core reads in production, and what `robkit deploy` reads. For each: its name, what it does, its default, and where to set it.

A test fails when the page lacks a name the code reads, or lists one the code doesn't.

**Blocked by:** 03, 04

**Status:** ready-for-agent

- [ ] Every `ROBKIT_` name the dev runner, core, the adapters and `robkit deploy` read is on the page with its default
- [ ] The names an app's `.env` can't set are listed, and match the dev runner's list
- [ ] A name the code reads that the page lacks fails a test, and so does a name on the page the code doesn't read
- [ ] The PR's CI `gate` job passes on GitHub
