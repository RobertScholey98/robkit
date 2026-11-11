# 10: Build an app: the database, settings and the layer rule

**What to build:** The pages a builder reads, whatever their stack, about their app's data and settings.

- **The database.** The app's own schema, `appDatabase()`, adding a table, generating a migration, and `pnpm robkit migrate <slug>` while `pnpm dev` runs. What a Go app does instead.
- **Settings.** The app's `.env`, what wins over what (the runner's own settings, then the shell, then the file), and that a test runs with no `pnpm dev` behind it. The names the file can't set are a rule, not only a list: the runner's own names, any name that starts `ROBKIT_`, and `NODE_ENV`. The page states the rule and links to the table in ticket 21, which has the one test of the list.
- **A value the browser reads.** A `VITE_*` or `NEXT_PUBLIC_*` value works under `pnpm dev` and isn't in a production image. Say what works today: read the setting on the server and hand it to the page. Whether robkit does more is R's to decide (ticket 32 of "Just use it"), so the page promises nothing.
- **The layer rule.** What an app may import, and what `robkit check` says when it doesn't. Milestone 4 changes what the docs say this check proves (its ticket 23). Write what the code does on this branch.

**Blocked by:** 03, 05

**Status:** ready-for-agent

- [ ] Every sample compiles, for every stack it shows
- [ ] Following the database page in an app made from this checkout adds a table and applies its migration in a running `pnpm dev`, and the Proof says how that was run
- [ ] The settings page gives the order of precedence the code has, and the Proof names where
- [ ] The layer rule page's messages are ones `robkit check` prints
- [ ] The PR's CI `gate` job passes on GitHub
