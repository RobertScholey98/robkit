---
"create-robkit": patch
---

init makes the install's first commit once its dependencies are in, without running the install's pre-commit hook. Where git isn't installed, has no name or email, or the commit fails, init says so in one line and carries on.
