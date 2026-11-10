# 07: Build an app: the pages every stack shares

**What to build:** The pages a builder reads whatever their stack, with the stack switcher where a sample differs.

- **The viewer and the guard.** What `guarded()` does for an app, what a handler gets as the viewer (an owner, a guest, their roles), and what the browser sees when someone isn't signed in or may not open the app. What an app must leave to the guard.
- **The database.** The app's own schema, `appDatabase()`, adding a table, generating a migration, and `pnpm robkit migrate <slug>` while `pnpm dev` runs.
- **Settings.** The app's `.env`, the names it can't set, what wins over what, and why a value the browser reads isn't in a production image yet.
- **Testing a route as a viewer.** Each adapter's `/testing` entry, with a test for an owner, a guest and nobody.
- **The layer rule.** What an app may import, and what `robkit check` says when it doesn't.
- **Changing state.** Why a write goes on POST, PUT, PATCH or DELETE, and how an app allows a framer.

Each page follows "The words" in the [PRD](../PRD.md): written for a person, checked against the code and not only against a repo doc, in the glossary's terms.

**Blocked by:** 03, 04

**Status:** ready-for-agent

- [ ] Each page's samples compile for every stack they show
- [ ] The settings page's refused names are the ones the dev runner refuses, and a test fails if they differ
- [ ] The testing page's example runs as a test in the repo's own example app for at least one stack
- [ ] The pages agree with `SECURITY.md` on what the guard does and doesn't do
- [ ] Each page says what its stack's `AGENTS.md` says, for a person
- [ ] The PR's CI `gate` job passes on GitHub
