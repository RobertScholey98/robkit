# 06: The home page

**What to build:** The page at robkit.dev's root. A newcomer should know in ten seconds what robkit is, and in a minute whether to try it.

- **One sentence** that says what robkit is, in the glossary's words. The README says "for your friends and family" and `CLAUDE.md` says "shared with the community". The sentence is a proposal, and ticket 28 is where R chooses it.
- **The three commands** that make an install and start it, with a copy button and the pre-release line. Until the first release the line links to the quickstart's checkout route, which works today.
- **What robkit gives you, and what stays yours.** One small example of what an app's author writes, a route that reads the viewer, beside what robkit has already done for that app: sign-in, a database schema and a subdomain. Shown from a template file, not a file tree.
- **What an install holds.** The hub where people sign in and launch apps, admin, core, one Postgres, and each app on its own subdomain. A diagram drawn as SVG, in both themes. Ticket 08 adds screenshots.
- **The five stacks**, from `readyStacks`, each linking to its guide.
- **Who it suits, and who it doesn't.** Draw it from the README and the map's destination: someone who wants several small apps behind one sign-in, on a domain and a server of their own. Say plainly that it isn't a hosted service. A proposal, for ticket 28.
- **What it needs.** To try it: Node, pnpm, Docker, and WSL on Windows. To host it: a server running Coolify, a domain, and TLS in front, which is the one path robkit supports today.
- **Ways in.** The quickstart is the one main button. The docs and GitHub are beside it, smaller.
- **Small print.** The licence, and where to report a problem: the repo's issues on GitHub. Promise no support beyond what the repo offers.

Design it with `/ui-ux-pro-max` from `site/DESIGN.md`. Each page follows "The words" in the [PRD](../PRD.md).

**Blocked by:** 03, 05

**Status:** ready-for-agent

- [ ] The page says what robkit is in one sentence, above the fold at 375 and at 1280 pixels wide
- [ ] The three commands are the README quickstart's, and a test fails if they differ
- [ ] The stacks on the page are `readyStacks`, and a test fails if they differ
- [ ] The example of an app's code is shown from a template file
- [ ] The page says who robkit suits, what trying it needs, what hosting it needs, and where to report a problem
- [ ] Every claim about what an install or an app holds matches what `npm create robkit` and `robkit add` write, and the PR's Proof says where each was checked
- [ ] axe finds nothing in light or dark, at 375 and at 1280 pixels wide
- [ ] With scripts off, everything on the page but the copy buttons works
- [ ] The page stays under the script size ticket 02 recorded
- [ ] The PR's CI `gate` job passes on GitHub
