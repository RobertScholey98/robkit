---
"create-robkit": patch
---

Deleting an app's folder now takes the app out of core's catalog when core next starts: it leaves the launcher and admin, and the rule you set for it in admin goes with it. Restart `pnpm dev`, or deploy, after you delete the folder. A slug that comes back is a new app, with the rule its manifest declares, or owner only. Core deletes nothing from Postgres: the app's schema and role stay until you drop them.

The install's `AGENTS.md` has a new "Removing an app" part, under "Adding and removing apps", with what removal doesn't do and how to drop the app's schema and role. `robkit upgrade` doesn't rewrite that file, so copy the part by hand if you want it.
