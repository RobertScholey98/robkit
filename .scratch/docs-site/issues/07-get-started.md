# 07: Get started

**What to build:** The pages that take an owner from nothing to a signed-in hub and a first app of their own. Ticket 02 wrote "What you need".

- **Quickstart.** Making an install, what init asks (the folder when none is given, and the example app's stack), what it prints, `pnpm dev`, and claiming the install in the hub. It ends with the owner signed in. It says what each refusal means: Node too old, no pnpm, Docker not answering, a port taken.
- **Two routes, one switch.** Until the first release the quickstart leads with the route that works today, an install made from a checkout of the repo, and shows `npm create robkit` as what it will be. The pre-release switch from ticket 05 turns that round: `npm create robkit` first, and the checkout route gone.
- **What you got.** The install's folders, from "Where things are" in the install's README: what each is for, in a short tree.
- **Your first app.** `pnpm robkit add` while `pnpm dev` runs, what it asks, the app's address, and the app in the launcher. Then one change to the app that the reader sees in the browser.
- **Where next.** Sharing the app with a guest, the guide for the reader's stack, and "Run an install".

Each page follows "The words" in the [PRD](../PRD.md). Read each message from the code that prints it. Describe a message without quoting it, unless a test fails when the code's text changes.

**Blocked by:** 03, 05

**Status:** ready-for-agent

- [ ] Following the quickstart's checkout route in WSL ends at a signed-in hub, and the PR's Proof says how that was run
- [ ] Following "Your first app" adds an app to a running `pnpm dev`, opens it from the launcher, and shows the page's one change in the browser. The Proof names the stack and the steps
- [ ] Each refusal the pages name is one the code prints, with the fix the code gives
- [ ] The folder tree matches what `npm create robkit` writes, and a test fails when a folder it names is gone from the templates
- [ ] With the pre-release switch off, the quickstart shows `npm create robkit` first and no checkout route
- [ ] The quickstart and "Your first app" are no longer stubs
- [ ] The PR's CI `gate` job passes on GitHub
