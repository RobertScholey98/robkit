# 13: A guide for TanStack Start

**What to build:** The TanStack Start guide, under the headings ticket 11 set, with the same parts: the template's own files shown with the component, the same "make it yours" steps done in a real app first, links out, and a test on the file list.

Start's server functions change what the guide must cover: a test calls the plain function a handler hands the viewer to, not the server function. Read the template for how the page reaches its server, and say what it does.

**Blocked by:** 11

**Status:** ready-for-agent

- [ ] The guide has ticket 11's headings, and shows the template's files with the component
- [ ] A test fails when the TanStack Start template gains or loses a file the guide names
- [ ] The "make it yours" steps were done in an app made from this checkout, and the Proof says so
- [ ] Every fence compiles, or is `nocheck` with its reason in the Proof
- [ ] The guide is no longer a stub
- [ ] The PR's CI `gate` job passes on GitHub
