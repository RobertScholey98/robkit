# 11: A guide for React + Hono

**What to build:** The first of five stack guides. It sets the headings the other four follow.

- **The app `robkit add` writes, file by file.** Every stack's template is a small working app already: a table, a route that reads and writes it as the viewer, a page that shows it, and a test. The guide walks through those files with ticket 05's component, so the code on the page is the template's own and can't drift. It explains the files a reader will edit and lists the rest in a tree.
- **Make it yours.** Then the reader changes it: a column or a table of their own, the migration, `pnpm robkit migrate`, the route, and its test. Do these steps in a real app made from this checkout before writing them down. These fences are the builder's own. Each compiles under the doc-examples check, or is marked `nocheck` with the reason in the Proof.
- **Links out.** To the shared pages from tickets 09 and 10 for the detail, and to Hono's and Vite's own docs for what isn't robkit's.
- **A test on the file list.** It fails when the template gains or loses a file the guide names. That is how the guide hears about a template change.

The headings are a template for tickets 12, 13, 14 and 15. Record them in this ticket's comments.

Milestone 4 changes the templates (ticket 27 of "Just use it": page titles and error states). The file-list test and the imported files show what moved when that lands, and ticket 26 reads the guides again.

**Blocked by:** 09, 10

**Status:** ready-for-agent

- [ ] The guide shows the template's files with the component from ticket 05, and pastes none
- [ ] A test fails when the React + Hono template gains or loses a file the guide names
- [ ] The "make it yours" steps were done in an app made from this checkout, and the Proof says so
- [ ] Every fence compiles, or is `nocheck` with its reason in the Proof
- [ ] The headings are in the ticket's comments
- [ ] The guide is no longer a stub
- [ ] The PR's CI `gate` job passes on GitHub
