# 19: Concepts

**What to build:** The pages that explain how robkit works, for a reader who wants to trust it.

- **How it works.** The hub, core, an app and its guard, and how a sign-in becomes a session and a token an app verifies by itself. A diagram drawn as SVG, in both themes, with a text version beside it. From `docs/architecture.md`, for an owner and not a contributor.
- **Security.** What robkit protects, and what an imported app can and can't do, written for an owner. Then the known gaps, built from `SECURITY.md`'s own list when the site builds, so a gap can't be added, dropped or reworded there without the page following. A link in that list into `.scratch/` becomes a link to the file on GitHub. How to report a vulnerability, with the address `SECURITY.md` gives.
- **Glossary.** Built from `GLOSSARY.md` when the site builds. Each term has an anchor other pages link to.

Milestone 4 changes `SECURITY.md` in several places (tickets 23, 27, 29 and 31 of "Just use it"). The built parts follow by themselves. Ticket 26 reads the written parts again.

**Blocked by:** 03, 05

**Status:** ready-for-agent

- [ ] The glossary page has every term `GLOSSARY.md` has, and a term added there appears with no edit to the site
- [ ] The known gaps on the page are `SECURITY.md`'s, and a gap added or reworded there changes the page with no edit to the site
- [ ] The page gives the way to report a vulnerability that `SECURITY.md` gives
- [ ] The diagram has a text alternative that says what it shows
- [ ] `GLOSSARY.md`, `SECURITY.md` and `docs/architecture.md` are among the site's turbo inputs
- [ ] The PR's CI `gate` job passes on GitHub
