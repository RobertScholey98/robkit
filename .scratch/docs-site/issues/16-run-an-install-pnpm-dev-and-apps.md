# 16: Run an install: `pnpm dev` and your apps

**What to build:** The pages an owner comes back to about the running install.

- **`pnpm dev`.** What it starts, the addresses it prints, its settings in the root `.env`, and each thing it checks before it starts with what to do about it.
- **Adding an app.** `robkit add` with and without a running `pnpm dev`, and its options.
- **Removing an app.** Delete its folder and restart `pnpm dev`. Say what the code does today: core never takes an app out of its catalog, so a removed app stays in the launcher and in admin, and its schema and data stay in Postgres. Milestone 4 changes that (ticket 24 of "Just use it"), and ticket 26 brings this page up to it.

Milestone 4 also changes how the commands find a running `pnpm dev` from another terminal (ticket 34). Write what the code does on this branch, and list in the comments what tickets 24 and 34 will change here.

**Blocked by:** 03, 05

**Status:** ready-for-agent

- [ ] Each check and refusal the `pnpm dev` page names is one the code makes, with the code's own fix
- [ ] The removal steps were followed in an install made from this checkout, and the page says what the launcher and Postgres show afterwards
- [ ] Every option of `robkit add` on the page is one the command takes
- [ ] The comments list what tickets 24 and 34 of "Just use it" will change on these pages
- [ ] The PR's CI `gate` job passes on GitHub
