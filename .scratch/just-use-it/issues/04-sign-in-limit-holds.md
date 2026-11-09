# 04: The sign-in limit holds under load

**What to build:** A generated access code is 5 characters from 31, about 28.6 million. The only brake on guessing is 10 failures per 15 minutes per exact address, and it can be got around three ways: rotate addresses inside one IPv6 /64, send a burst before the first verdict comes back, or do both ([review](../research/review-2026-11-09.md), "Core"). R chose to keep codes at 5 characters and harden the limit (2026-11-09).

- **An attempt is reserved before its verdict.** `/login` and `/login/code` each take a place in the client's limit, and `/login/code` one in the install's budget, before they `await` the check. A sign-in that succeeds gives back its own place and nothing else: a right code must never clear the client's earlier failures, for the reason the comment in `routes/session.ts` gives.
- **IPv6 counts by /64.** `clientOf` keys an IPv6 address by its first 64 bits. IPv4 stays whole. An address that won't parse counts as `unknown`, as a missing header does.
- **An install-wide budget for wrong codes.** After 50 wrong codes across all clients in 15 minutes, `/login/code` answers 429 to everyone until the window passes. This is the trade R accepted: an attacker can stop new code sign-ins for a while, and guessing one 5-character code takes years. Signed-in guests and the owner's password sign-in are unaffected. The numbers are constants with a comment that shows the arithmetic.
- **A code is at least 5 characters.** Admin refuses to create or change a code to a shorter one. On an https install, sign-in refuses a shorter code too, and admin shows such a code as not working, with why. Otherwise the budget leaves a 3-character code guessable in days. A local install still takes `test`. Say in the changeset that shorter codes need replacing.
- **Password checks are bounded.** At most a few scrypt checks run at once. Each takes 32 MB, so many clients inside their own limits could otherwise exhaust core. The rest wait briefly or get 429.
- **The limiter is bounded.** Its map has a cap, and pruning doesn't walk every client on every failure.
- **Core says when a limit trips.** One log line when a client or the install reaches its limit, with the client's key and never the code tried.
- **Query parameters stay out of the error log.** Drizzle's `DrizzleQueryError` carries the failed query's parameters, and core logs an unexpected error whole (`app.ts`, `onError`). So a database fault during sign-in or setup would log the code someone typed or the owner's password hash. Core logs the query and the cause without the parameters.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] A burst of 100 concurrent wrong sign-ins from one client gets at most the limit's worth of verdicts, for both routes
- [ ] A burst of wrong codes from many clients at once never gets more verdicts than the install's budget
- [ ] In a burst that mixes right and wrong codes, each right one signs in and gives back only its own place
- [ ] Wrong codes from many addresses in one IPv6 /64 share one limit
- [ ] After the budget is spent, a right code from a fresh client gets 429 with `Retry-After`, and works again once the window passes
- [ ] Admin refuses a new code under 5 characters; on an https install a 3-character code no longer signs in and admin says why; a local install still takes `test`
- [ ] No more than the cap of password checks run at the same time
- [ ] The limiter's map can't grow past its cap
- [ ] A database fault during `/login/code` logs the failed query and no parameter
- [ ] `SECURITY.md`'s known gaps say what the limit now holds against and what it costs
- [ ] The PR's CI `gate` job passes on GitHub
