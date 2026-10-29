# 21: Kit matrix CI

**What to build:** The end-to-end journey already runs on the default install (ticket 08). This ticket runs generated installs across combinations. On each PR, robkit's CI builds a pairwise set that covers every pair of choices at least once, and runs the journey once per stack. A nightly job builds the full matrix of package managers, ORMs, UI options and stacks. None of this ships in a user's install.

**Blocked by:** 13, 14, 16, 17, 19, 20

**Status:** ready-for-agent

- [ ] The pairwise set is computed from the option lists, so adding an option updates it
- [ ] The bun job is required
- [ ] A broken combination fails CI with the combination named

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
