# 05: The sign-in limit holds under load

**What to build:** A generated access code is 5 characters from 31, about 28.6 million. The only brake on guessing is 10 failures per 15 minutes per exact address, and it can be got around three ways: rotate addresses inside one IPv6 /64, send a burst before the first verdict comes back, or do both ([review](../research/review-2026-11-09.md), "Core"). R chose to keep codes at 5 characters and harden the limit (2026-11-09).

- **An attempt counts before its verdict.** Both `/login` and `/login/code` record the attempt before they `await` the check, and take it back when the sign-in succeeds. A burst of requests can't all pass an empty limit.
- **IPv6 counts by /64.** `clientOf` keys an IPv6 address by its first 64 bits. IPv4 stays whole. An address that won't parse counts as `unknown`, as a missing header does.
- **An install-wide budget for wrong codes.** After 50 wrong codes across all clients in 15 minutes, `/login/code` answers 429 to everyone until the window passes. This is the trade R accepted: an attacker can stop new code sign-ins for a while, and can't guess a code in any useful time. Signed-in guests and the owner's password sign-in are unaffected. The numbers are constants with a comment that shows the arithmetic.
- **A custom code is at least 5 characters.** Creating or changing a code in admin refuses a shorter one. Sign-in still accepts existing shorter codes, and `test` on a local install.
- **The limiter is bounded.** Its map has a cap, and pruning doesn't walk every client on every failure.
- **Core says when a limit trips.** One log line when a client or the install reaches its limit, with the client's key and never the code tried.
- **Check the error log.** Confirm whether Drizzle puts query parameters in the message core logs for an unexpected error (`app.ts`, `onError`). If it does, keep typed codes and password hashes out of the log.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] A burst of 100 concurrent wrong sign-ins from one client gets at most the limit's worth of verdicts, for both routes
- [ ] Wrong codes from many addresses in one IPv6 /64 share one limit
- [ ] After the install-wide budget is spent, a right code from a fresh client gets 429 with `Retry-After`, and works again once the window passes
- [ ] A right sign-in doesn't use up the client's limit or the install's budget
- [ ] Admin refuses a new custom code under 5 characters; an existing 3-character code still signs in
- [ ] The limiter's map can't grow past its cap
- [ ] `SECURITY.md`'s known gaps say what the limit now holds against and what it costs
- [ ] The PR's CI `gate` job passes on GitHub
