# 03: The navigation comes from the pages

**What to build:** A page says where it belongs in its own front matter, and the sidebar, the order and the links between pages follow from that. Nobody edits a list of pages by hand.

- **One function builds the navigation.** It takes the pages' front matter (section, title, order) and returns the sidebar's sections, each page's place, and its next and previous pages. It is plain data in and out, with unit tests.
- **The sidebar** shows the PRD's sections in its order, and marks the page the reader is on.
- **On this page.** The list of a page's headings comes from the page, and marks the heading in view.
- **Next and previous** links at the foot of each page.
- **Edit this page.** Each page links to its source file on GitHub.
- **Links are checked.** A test over the built site fails on an internal link or anchor that leads nowhere. It runs in `test:unit`.
- A second and third page exist to prove it: stubs of the quickstart and "Your first app", each with a title, a description and one true paragraph. Ticket 06 writes them.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] The function's unit tests cover the order within a section, the order of sections, a page with no order, and the first and last page's missing neighbour
- [ ] A page with no section or title fails the build with a message that names the file
- [ ] The sidebar marks the current page, and a screen reader hears which one it is
- [ ] Each page has next and previous links that match the sidebar's order
- [ ] Each page's edit link points at its file on GitHub
- [ ] A link to a page or an anchor that doesn't exist fails a test that names the page and the link
- [ ] The PR's CI `gate` job passes on GitHub
