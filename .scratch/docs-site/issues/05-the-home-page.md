# 05: The home page

**What to build:** The page at robkit.dev's root. A newcomer should know in ten seconds what robkit is, and in a minute whether to try it.

- **One sentence** that says what robkit is, in the glossary's words.
- **The three commands** that make an install and start it, with a copy button and the pre-release line.
- **What an install holds.** The hub where people sign in and launch apps, admin, core, one Postgres, and each app on its own subdomain. A diagram drawn as SVG, in both themes. Ticket 17 adds screenshots.
- **What you get in an app.** Sign-in, a database schema and a subdomain, already wired, shown by the few files a new app has.
- **The five stacks**, each linking to its guide.
- **Who it suits, and who it doesn't.** Draw it from the README and the map's destination: someone who wants several small apps behind one sign-in, on a domain and a server of their own. Say plainly that it isn't a hosted service. The wording is a proposal, and ticket 19 is where R reads it.
- **What it needs**: Node 24, pnpm, Docker, and WSL on Windows.
- **Ways in**: the quickstart, the docs, and GitHub.

Design it with `/ui-ux-pro-max` from the system ticket 02 saved. Each page follows "The words" in the [PRD](../PRD.md): written for a person, checked against the code and not only against a repo doc, in the glossary's terms.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] The page says what robkit is in one sentence, above the fold at 375 and at 1280 pixels wide
- [ ] The three commands are the README quickstart's, and a test fails if they differ
- [ ] Every claim about what an install or an app holds matches what `npm create robkit` and `robkit add` write, and the PR's Proof says where each was checked
- [ ] axe finds nothing in light or dark, at 375 and at 1280 pixels wide
- [ ] With scripts off, everything on the page but the copy buttons works
- [ ] The page stays under the script size ticket 02 recorded
- [ ] The PR's CI `gate` job passes on GitHub
