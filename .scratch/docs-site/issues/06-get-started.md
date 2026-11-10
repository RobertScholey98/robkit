# 06: Get started

**What to build:** The pages that take an owner from nothing to a signed-in hub and a first app of their own. Ticket 02 wrote "What you need".

- **Quickstart.** `npm create robkit`, the one question it asks, what it prints, `pnpm dev`, and claiming the install in the hub. It ends with the owner signed in. It says what each refusal means: Node too old, no pnpm, Docker not answering, a port taken.
- **Your first app.** `pnpm robkit add` while `pnpm dev` runs, what it asks, the app's address, and the app in the launcher. Then one change to the app that the reader sees in the browser.
- **Where next**: the guide for the reader's stack, and "Run an install".

Each page follows "The words" in the [PRD](../PRD.md): written for a person, checked against the code and not only against a repo doc, in the glossary's terms. Read each message from the code that prints it. Where a page quotes one, a test should fail when the code's text changes, or the page should describe the message without quoting it.

**Blocked by:** 03, 04

**Status:** ready-for-agent

- [ ] Following the quickstart in an install made from this checkout ends at a signed-in hub, and the PR's Proof says how that was run
- [ ] Following "Your first app" adds an app to a running `pnpm dev` and shows it in the launcher
- [ ] Each refusal the pages name is one the code prints, with the fix the code gives
- [ ] Every command on the pages exists, and every `ts` fence compiles
- [ ] Each page carries the pre-release line where it shows `npm create robkit`
- [ ] The PR's CI `gate` job passes on GitHub
