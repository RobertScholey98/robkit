# 11: Concepts

**What to build:** The pages that explain how robkit works, for a reader who wants to trust it.

- **How it works.** The hub, core, an app and its guard, and how a sign-in becomes a session and a token an app verifies by itself. A diagram drawn as SVG, in both themes, with a text version beside it. From `docs/architecture.md`, for an owner and not a contributor.
- **Security.** What robkit protects, what an imported app can and can't do, and the known gaps, from `SECURITY.md`. How to report a vulnerability.
- **Glossary.** Built from `GLOSSARY.md` when the site builds, so it can't drift. Each term has an anchor other pages link to.

Each page follows "The words" in the [PRD](../PRD.md): written for a person, checked against the code and not only against a repo doc, in the glossary's terms.

**Blocked by:** 03, 04

**Status:** ready-for-agent

- [ ] The glossary page has every term `GLOSSARY.md` has, and a term added there appears with no edit to the site
- [ ] The security page lists every known gap `SECURITY.md` lists, and a test fails when the two differ in count
- [ ] The diagram has a text alternative that says what it shows
- [ ] The pages claim nothing `SECURITY.md` and the code don't support
- [ ] The PR's CI `gate` job passes on GitHub
