# 63: robkit deploy takes Coolify's only project whatever name coolify.json gives

**What to build:** `coolify.json` names a project, a server and a GitHub App. When Coolify has exactly one of a kind, `robkit deploy` takes that one without comparing names (`pick()` in `packages/create-robkit/src/coolify-host.ts` returns the only item when `items.length === 1`). So a typo in `coolify.json`, or a file copied from another install, deploys to whatever Coolify has. It refuses a name only when Coolify has two or more of that kind, or none. The environment lookup always compares names.

The docs site's deploy guide now says what the code does. The question for R is whether the code should change.

**Questions for R:**

1. **Should `robkit deploy` refuse a name Coolify doesn't have, even when Coolify has only one?**
   - **Yes, when `coolify.json` gives a name** (recommended). A name the owner wrote is a claim about where the install goes, and deploying somewhere else is the costly mistake. Taking the only one stays for a `coolify.json` that leaves the name out.
   - **No, keep it.** A Coolify with one project is the common case, and the name is noise there.

Found by the council's review of the docs site, in the round before `docs-site` merges to `main`.

**Blocked by:** none

**Status:** needs-triage

- [ ] R has answered the question
- [ ] `robkit deploy` does what R chose, with a test for a `coolify.json` naming a project Coolify lacks when Coolify has one
- [ ] The deploy guide and the install's `docs/deploy.md` say the same
- [ ] The changeset names create-robkit
