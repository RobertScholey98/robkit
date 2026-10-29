# 14: Kit matrix CI

**What to build:** robkit's own CI generates real projects. On each PR it builds a pairwise set of combinations covering every pair of choices at least once, and runs one end-to-end journey per stack (sign in with `test`, open the launcher, open the example app). A nightly job builds the full matrix of package managers, ORMs, UI options and stacks. None of this ships in a user's install.

**Blocked by:** 10, 11, 12, 13

**Status:** ready-for-agent

- [ ] The pairwise set is computed from the option lists, so adding an option updates it
- [ ] The bun job is required
- [ ] A broken combination fails CI with the combination named

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
