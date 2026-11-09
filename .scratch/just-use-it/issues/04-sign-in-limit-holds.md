# 04: The sign-in limit holds under load

**What to build:** A generated access code is 5 characters from 31, about 28.6 million. The only brake on guessing is 10 failures per 15 minutes per exact address, and it can be got around three ways: rotate addresses inside one IPv6 /64, send a burst before the first verdict comes back, or do both ([review](../research/review-2026-11-09.md), "Core"). R chose to keep codes at 5 characters and harden the limit (2026-11-09).

- **An attempt is reserved before its verdict.** `/login` and `/login/code` each take a place in the client's limit, and `/login/code` one in the install's budget, before they `await` the check. A request that finds no place free gets 429 without a check, right code or wrong.
- **Every reservation ends one of two ways.** It becomes a recorded failure when the check says wrong, or it is released: when the sign-in succeeds, when the install is unclaimed, and when the check throws, as it does with the database down. Release it in a `finally`, so no path leaks a place. A leaked place in the install's budget would stop code sign-in until core restarts.
- **What success clears.** A right code releases its own place and nothing else: it must never clear the client's earlier failures, for the reason the comment in `routes/session.ts` gives. A right password still clears the client's failures, as `/login` does today.
- **Clients are keyed by network.** `clientOf` keys an IPv6 address by its first 64 bits. An IPv4-mapped IPv6 address, such as the `::ffff:a.b.c.d` the dev proxy writes, counts as its IPv4 address. IPv4 stays whole. An address that won't parse counts as `unknown`, as a missing header does.
- **An install-wide budget for wrong codes.** After 20 wrong codes across all clients in an hour, `/login/code` answers 429 to everyone until the window passes. This is the trade R accepted: an attacker can stop new code sign-ins for a while. Signed-in guests and the owner's password sign-in are unaffected.
- **Honest arithmetic.** An attacker wants any live code, not one in particular, so the time to a hit divides by the number of live codes. At 20 an hour, trying all 28.6 million takes about 160 years, which is about 8 years with 20 live codes. The constants carry a comment that shows this sum, and `SECURITY.md` gives it the same way, with the number of live codes in it.
- **Password checks are bounded.** At most a few scrypt checks run at once, wherever a hash is made or checked: the cap sits in `password.ts`, so `/setup` on an unclaimed install is covered too. Each takes 32 MB, so many clients inside their own limits could otherwise exhaust core. The rest wait briefly or get 429.
- **The limiter is bounded, and full means refuse.** Its map has a cap, and pruning doesn't walk every client on every failure. At the cap, a client not yet in the map is refused. A failure that hasn't expired is never evicted to make room, or rotating addresses would wipe a client's count.
- **Core says when a limit trips.** One log line when a client, the install or the map reaches its limit, with the client's key and never the code tried.

Two things this leaves, to say in `SECURITY.md`'s known gaps. A 3-character code stays guessable in weeks; [ticket 29](29-access-codes-at-least-five.md) takes that and waits for R. And someone with many addresses can fill the password checks and slow the owner's sign-in for as long as they keep it up.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] A burst of 100 concurrent wrong sign-ins from one client gets at most the limit's worth of verdicts, for both routes
- [ ] A burst of wrong codes from many clients at once never gets more verdicts than the install's budget
- [ ] In a burst that mixes right and wrong codes, each right one that got a place signs in and releases only its own place
- [ ] A check that throws leaves the client's limit and the install's budget as they were, and so does a sign-in on an unclaimed install
- [ ] A right password clears the client's failures; a right code doesn't
- [ ] Wrong codes from many addresses in one IPv6 /64 share one limit, and `::ffff:203.0.113.7` shares one with `203.0.113.7` and not with other IPv4 clients
- [ ] After the budget is spent, a right code from a fresh client gets 429 with `Retry-After`, and works again once the window passes
- [ ] No more than the cap of password checks run at the same time, `/setup`'s included
- [ ] With the map full, a new client is refused, and an existing client's unexpired failures are still counted
- [ ] `SECURITY.md`'s known gaps give the arithmetic with the number of live codes, what the limit costs, and the two things it leaves
- [ ] The PR's CI `gate` job passes on GitHub
