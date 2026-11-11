---
"create-robkit": patch
---

`robkit deploy` runs only from a commit on the deploy branch as a remote holds it. Coolify builds the branch from GitHub, not your checkout, so a deploy from a commit you haven't pushed would record a build that never happened. Before it reaches Coolify, it now checks that the checkout's commit is on the branch `coolify.json` names at some remote, and `--dry-run` checks too. If not, it stops with:

> Coolify builds main as GitHub holds it, not this checkout, so robkit deploy runs only from a commit pushed to main. From any other it would record a build that never happened. This checkout's commit, 1a2b3c4, isn't on main at any remote. Push it, or fetch if it's pushed already, then deploy again.

Push, then deploy again. A remote branch ahead of your checkout is fine, and CI's checkout of a push to `main` passes as it is.

`robkit deploy` also stops before any write when Coolify lists an application without the environment it belongs to, since it can't then tell which applications are this install's. It says it needs Coolify 4.3 or later.
