# 03: The navigation comes from the pages

**What to build:** A page says where it belongs in its own front matter, and the sidebar, the order and the links between pages follow from that. Nobody edits a list of pages by hand.

- **One function builds the navigation.** It takes the pages' front matter (section, title, order) and returns the sidebar's sections, each page's place, and its next and previous pages. It is plain data in and out, with unit tests. Two pages with the same order sort by title.
- **The sidebar** shows the PRD's sections in its order, and marks the page the reader is on.
- **On this page.** The list of a page's headings comes from the page, links to each, and marks the heading in view.
- **Next and previous** links at the foot of each page.
- **Edit this page.** Each page links to its source file on GitHub. A page built from another file, as the glossary will be, links to that file. The links lead nowhere until `docs-site` merges to `main`, which is expected.
- **Stubs.** A page not written yet is a stub: its front matter says so, it shows one true paragraph and "This page isn't written yet", and a test counts the stubs. This ticket adds a stub for the quickstart, "Your first app" and each of the five stack guides, so later pages have something to link to. Ticket 26 fails if one is left.
- **What a page describes.** A page's front matter can name the repo files it describes. A script takes a list of changed files and prints the pages that name them, so whoever changes robkit can see which pages to read again. It fails nothing.
- **Links are checked.** A test over the built site fails on an internal link, an anchor or a local image that leads nowhere. It runs in `test:unit`.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] The function's unit tests cover the order within a section, the order of sections, two pages with the same order, a page with no order, and the first and last page's missing neighbour
- [ ] A page with no section or title fails the build with a message that names the file
- [ ] The sidebar marks the current page, and a screen reader hears which one it is
- [ ] The list of headings links to real headings, marks the one in view as the page scrolls, and works as plain links with scripts off
- [ ] Each page has next and previous links that match the sidebar's order
- [ ] Each page's edit link points at its file on GitHub
- [ ] A link to a page, an anchor or a local image that doesn't exist fails a test that names the page and the link
- [ ] A test reports how many stubs the site has, and each stub says it isn't written yet
- [ ] Given a changed file, the script prints the pages whose front matter names it
- [ ] The PR's CI `gate` job passes on GitHub
