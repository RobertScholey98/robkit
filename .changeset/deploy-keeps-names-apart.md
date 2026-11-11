---
"create-robkit": patch
---

`robkit deploy` no longer creates a second application beside one that already has an app's name. It counts an application as the install's only when it is built from the repository in `coolify.json`. So after the repository was renamed or moved, and `repository` changed to match, every app read as new and the deploy would create each again, with the same name and domain. It now stops before it writes anything, names each application and the repository Coolify builds it from, and says what to do:

> coolify.json names you/your-install. If the repository moved, change each application's repository to that in Coolify, then deploy again. If they are another install's, give this install its own project or environment in coolify.json.

`--dry-run` with `COOLIFY_URL` and `COOLIFY_TOKEN` stops the same way.
