# 21: Reference: every setting

**What to build:** One page listing every setting an owner or a builder meets. For each: its name, what it does, who sets it, where, and its default in dev and in production, or that it has none.

- **Three kinds.** Settings an owner sets (the install's dev settings in the root `.env`, core's in production, and what `robkit deploy` reads, such as `COOLIFY_URL`). Settings robkit sets for an app, which the app reads and doesn't choose (`DATABASE_URL`, `PORT`, `ROBKIT_APP`). And the names an app's `.env` can't set, with the rule: the runner's own names, any name that starts `ROBKIT_`, and `NODE_ENV`.
- **Held to the code.** A test scans the source of the published packages and the Go module for names that start `ROBKIT_`, leaving out tests and test helpers, and fails where the page and the scan differ. Names without that prefix, such as `DATABASE_URL`, `HOST`, `PORT`, `COOLIFY_TOKEN` and the two Cloudflare Access names, are held by a list in the test, each with the file that reads it.
- **The refused names** come from the dev runner, which doesn't export them. Export them from `@robkit/dev`, in a commit of its own with a changeset, and build that part of the table from the export.

Milestone 4 makes `ROBKIT_APPS` required by core (ticket 24 of "Just use it") and changes what `robkit deploy` sets (ticket 22).

**Blocked by:** 03, 05

**Status:** ready-for-agent

- [ ] Every `ROBKIT_` name the published packages and the Go module read is on the page, and none is on the page that the code doesn't read
- [ ] The names without the prefix that the test lists are on the page, each with who sets it and where
- [ ] Each setting says its default in dev and in production, or that it must be set
- [ ] The refused names on the page are the dev runner's, built from its export, which has a changeset and is in the API report
- [ ] The page says where each kind of setting goes and what wins over what
- [ ] The PR's CI `gate` job passes on GitHub
