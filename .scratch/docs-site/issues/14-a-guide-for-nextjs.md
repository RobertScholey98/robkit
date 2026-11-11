# 14: A guide for Next.js

**What to build:** The Next.js guide, under the headings ticket 11 set, with the same parts: the template's own files shown with the component, the same "make it yours" steps done in a real app first, links out, and a test on the file list.

Cover what is Next's own: `withRobkit()` in the config, where the guard runs, and which files Next loads besides the app's `.env`. Milestone 4 may add what `next/image` can show from `public` (ticket 27 of "Just use it"). Say nothing about it until that lands.

**Blocked by:** 11

**Status:** ready-for-agent

- [ ] The guide has ticket 11's headings, and shows the template's files with the component
- [ ] A test fails when the Next.js template gains or loses a file the guide names
- [ ] The "make it yours" steps were done in an app made from this checkout, and the Proof says so
- [ ] Every fence compiles, or is `nocheck` with its reason in the Proof
- [ ] The guide is no longer a stub
- [ ] The PR's CI `gate` job passes on GitHub
