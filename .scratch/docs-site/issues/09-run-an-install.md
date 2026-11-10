# 09: Run an install

**What to build:** The pages an owner comes back to.

- **`pnpm dev`.** What it starts, the addresses it prints, its settings in the root `.env`, and each thing it checks before it starts with what to do about it.
- **Adding and removing apps.** `robkit add` with and without a running `pnpm dev`, its options, and why removing one needs a restart.
- **Guests, access codes and roles.** Claiming the install, making a code in admin, roles, who may open each app, and intro links. What a guest sees.
- **Upgrading.** `pnpm robkit upgrade`, what it changes and never changes, what it refuses, the changelog it prints, and the commands that undo one stopped partway.

Each page follows "The words" in the [PRD](../PRD.md): written for a person, checked against the code and not only against a repo doc, in the glossary's terms.

**Blocked by:** 03, 04

**Status:** ready-for-agent

- [ ] Each check and refusal the `pnpm dev` page names is one the code makes, with the code's own fix
- [ ] The upgrade page's undo commands are the ones the install's README gives, and a test fails if they differ
- [ ] The access page matches what admin and the hub do, and the PR's Proof says how that was checked
- [ ] Every command on the pages exists
- [ ] The PR's CI `gate` job passes on GitHub
