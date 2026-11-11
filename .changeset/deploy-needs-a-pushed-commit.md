---
"create-robkit": patch
---

`robkit deploy` runs only from a commit on the deploy branch as the repository in `coolify.json` holds it. Coolify builds the branch from that repository, not your checkout, so a deploy from a commit you haven't pushed would give the apps this checkout's variables and build without its code. Before it reaches Coolify, it now checks that the checkout's commit is on the branch at a remote for that repository, and `--dry-run` checks too. A remote counts when its URL ends in the repository's name, so a push to a fork or a backup doesn't. If the commit isn't there, it stops with:

> Coolify builds main as you/your-install holds it, not this checkout, so robkit deploy runs only from a commit pushed there. This checkout's commit, 1a2b3c4, isn't on main at a remote for you/your-install. Push it, or fetch if it's pushed already, then deploy again. A remote counts when its URL ends in you/your-install.

Push, then deploy again. A remote branch ahead of your checkout is fine, and CI's checkout of a push to `main` passes as it is.

`robkit deploy` also stops before any write when Coolify lists an application without the environment it belongs to, since it can't then tell which applications are this install's. It says it needs Coolify 4.3 or later.
