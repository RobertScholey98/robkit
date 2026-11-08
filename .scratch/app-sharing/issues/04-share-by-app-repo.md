# 04: Share apps as git app repos (approach B)

**What to build:** every app is its own git repo, and portable from the moment it's made. Instead of copying a snapshot out (ticket 03), an app keeps its upstream, so updates flow with git. The other half of the side-by-side comparison with 03.

- **Portable by contract.** An app may import only what every install of its robkit version provides: the `@robkit/*` packages and the install's fixed workspace packages (`packages/ui`, `packages/theme`, `packages/core-client`), whose names and API are the same in every install now that the stack is one (ticket 01). Anything else it needs lives inside its own folder. `robkit check` enforces it, so an app that breaks it can't be shared by accident. No import rewriting.
- **`robkit add`** makes each app its own git repo (nested in the install, ignored by the install's repo), with a manifest naming its stack, icon, default access, description and robkit contract version.
- **`pnpm robkit share <slug> [<remote or path>]`** publishes the app repo: pushes it to a remote, or creates a bare or plain repo at a local path. The install remembers the remote.
- **`pnpm robkit install <git URL or path>`** clones an app into `apps/<slug>` (`--as <slug>` to rename, refused if taken), checks its contract version, installs, and records where it came from in `robkit.json`.
- **`pnpm robkit update <slug>`** pulls the app's upstream into the owner's copy with git, so the owner's own edits survive and conflicts show as git conflicts.
- **Database:** migrations and an optional seed file travel with the repo. The seed runs once, when the app's schema is first made, through the provision step.
- **Stack-agnostic:** nothing in share, install or update reads a stack's file layout.

**For R to test tomorrow:** a sample app repo that lives outside any install (for example a guestbook, with a seed), and a `TESTING.md` at the worktree's root with copy-paste commands for R's whole acceptance test: create install A from this worktree, install the sample, add an app, change its frontend and its schema (with a new migration), share it, create install B, install it, see the change and the seed there, then change it again in A and `update` it in B. Say where WSL is needed.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] An app `robkit add` makes is its own git repo and passes `robkit check`'s portability rule
- [ ] `robkit check` refuses an app that imports from outside its folder, other than the contract packages
- [ ] `pnpm robkit share` and `pnpm robkit install` move an app from install A to a fresh install B, and a guest opens it from the launcher
- [ ] A schema change made in A reaches B as a migration; the seed runs once
- [ ] `pnpm robkit update` brings a later change from A into B, keeping B's own edits
- [ ] Both stacks share, install and update
- [ ] An app made for a contract version the install can't run is refused with a clear message
- [ ] A sample app repo and `TESTING.md` exist, and R's acceptance test passes end to end in a test

**Answered (R, 2026-11-05):** schema plus an optional seed travels, never data.

Source: [App sharing PRD](../PRD.md)
