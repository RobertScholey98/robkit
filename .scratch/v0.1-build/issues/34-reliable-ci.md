# 34: CI passes reliably

**What to build:** About 4 in 10 runs of robkit's CI fail, on `main` and on ticket branches alike, and a rerun of the same commit usually passes. Each failure is a whole-stack browser journey timing out after 30 seconds on a `fill`, `click` or `waitFor`, in a different test each time. After this ticket, the cause of those timeouts is found and fixed, and CI passes run after run on the same commit. Core's `verifyPassword` also turns any scrypt error into `false`, so under load it could refuse the owner's correct password. After this ticket it refuses only a wrong password.

**Blocked by:** 20

**Status:** ready-for-agent

- [ ] The root cause of the journey timeouts is named, with evidence from failed runs, and fixed rather than waited out
- [ ] Five consecutive CI runs of the same commit pass
- [ ] `verifyPassword` refuses only wrong passwords; an unexpected scrypt error fails loudly instead of reading as a wrong password
- [ ] The WSL gate still passes

Source: the CI history of tickets 04 to 20 (2026-11-04)
