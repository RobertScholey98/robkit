# 28: R reads the design and the home page

**What to build:** Nothing. This is R's read of the site before it goes live. The other tickets carry on while it waits, but nothing is published until R has approved the design and the home page's words. A change R asks for is made before the site is published, unless R says it can wait.

**For R.** The built site is an artifact of the latest CI run on the `docs-site` branch: download it, unzip it and run `npx serve <folder>`, since a page opened as a file loses its links. The style guide is `site/DESIGN.md`.

**Questions for R**, each with what was built as the default:

1. **The one sentence that says what robkit is.** The README says "for your friends and family", and `CLAUDE.md` says "shared with the community". The home page has the builder's proposal.
2. **Who it suits, and who it doesn't.** Built: someone who wants several small apps behind one sign-in, on a domain and a server of their own, and not a hosted service.
3. **Which commands the home page shows before the first release.** Built: the three `npm create robkit` commands, with a line saying they work after the release and a link to the checkout route that works today. The other choice is to show the checkout route's commands until the release.
4. **The look.** The first screen's order, the colours and the type. Say what to change, or that it's good.

5. **The screenshots.** The council's review found two things that need new pictures, which nobody has taken. The hub's launcher picture is two-thirds empty space. The sign-in and admin pictures are small on a 1280-pixel screen. Say whether to retake them cropped closer, or leave them.

**Blocked by:** 06

**Status:** needs-info

- [ ] R has answered the five questions
- [ ] What R asked for is done, or R has said it can wait
