# 04: The sign-in limit holds under load

**What to build:** A generated access code is 5 characters from 31, about 28.6 million. The only brake on guessing is 10 failures per 15 minutes per exact address, and it can be got around three ways: rotate addresses inside one IPv6 /64, send a burst before the first verdict comes back, or do both ([review](../research/review-2026-11-09.md), "Core"). R chose to keep codes at 5 characters and harden the limit (2026-11-09).

- **An attempt is reserved before its verdict.** `/login` and `/login/code` each take a place in the client's limit, and `/login/code` one in the install's budget, before they `await` the check. A request that finds no place free gets 429 without a check, right code or wrong.
- **Every reservation ends one of two ways.** It becomes a recorded failure when the check says wrong, or it is released: when the sign-in succeeds, when the install is unclaimed, and when the check throws, as it does with the database down. Release it in a `finally`, so no path leaks a place. A leaked place in the install's budget would stop code sign-in until core restarts.
- **What success clears.** A right code releases its own place and nothing else: it must never clear the client's earlier failures, for the reason the comment in `routes/session.ts` gives. A right password still clears the client's recorded failures, as `/login` does today. It leaves the client's other attempts that are still being checked in their places, and each of those ends as its own verdict says.
- **A place outlives its window.** A place reserved before a window ends is held until its verdict, and a wrong verdict is recorded at the time it arrives.
- **Clients are keyed by network.** `clientOf` keys an IPv6 address by its first 64 bits. An IPv4-mapped IPv6 address, such as the `::ffff:a.b.c.d` the dev proxy writes, counts as its IPv4 address. IPv4 stays whole. An address that won't parse counts as `unknown`, as a missing header does.
- **An install-wide budget for wrong codes.** After 20 wrong codes across all clients in an hour, `/login/code` answers 429 to everyone until the window passes. This is the trade R accepted: an attacker can stop new code sign-ins for a while. Signed-in guests and the owner's password sign-in are unaffected.
- **Honest arithmetic.** An attacker wants any live code, not one in particular, so the time to a hit divides by the number of live codes. At 20 an hour, trying all 28.6 million takes about 160 years, and about 8 years with 20 live codes. Those are the times to try every code; a hit is expected in about half of each. The constants carry a comment that shows this sum, and `SECURITY.md` gives it the same way, with the number of live codes in it.
- **Password checks are bounded.** At most 2 scrypt checks run at once, wherever a hash is made or checked: the cap sits in `password.ts`, so `/setup` on an unclaimed install is covered too. Node runs scrypt on a pool of 4 threads that it shares with DNS lookups, which every new Postgres connection needs, so the cap stays below 4 to leave threads free. A small fixed number of checks wait their turn. A request that finds the queue full gets 429 with `Retry-After`, and releases its place. Say the reason in the comment.
- **The limiter is bounded, and a full one never locks the owner out.** Each limiter's map holds at most 50,000 clients, and pruning doesn't walk every client on every failure. A failure that hasn't expired is never evicted to make room, or rotating addresses would wipe a client's count. When a map is full, what happens to a client not yet in it depends on the route:
  - `/login/code` refuses it with 429. The install's budget already holds wrong codes to 20 an hour, so this map fills only if something else is wrong.
  - `/login` lets it try and doesn't count it. Refusing would let someone with many addresses lock the owner out of password sign-in, which R didn't accept. The cap on password checks is the brake then.

  The comment on the size shows the sum: at 2 checks at once, a window holds only so many wrong passwords, and the size sits above that, so rotating addresses doesn't fill the map.
- **Core says when a limit trips, once.** One log line when a client, the install or a map reaches its limit, with the client's key and never the code tried. The requests it then refuses log nothing until that limit has cleared and trips again, or a flood of refusals would fill the log.

Three things this leaves, to say in `SECURITY.md`'s known gaps. A 3-character code stays guessable in weeks; [ticket 29](29-access-codes-at-least-five.md) takes that and waits for R. Someone with many addresses can fill the password checks and slow the owner's sign-in for as long as they keep it up. And with many addresses the limit per client stops counting, so the rate of password guesses is whatever the cap on checks allows.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] A burst of 100 concurrent wrong sign-ins from one client gets at most the limit's worth of verdicts, for both routes
- [ ] A burst of wrong codes from many clients at once never gets more verdicts than the install's budget
- [ ] In a burst that mixes right and wrong codes, each right one that got a place signs in and releases only its own place
- [ ] A check that throws leaves the client's limit and the install's budget as they were, and so does a sign-in on an unclaimed install
- [ ] A right password clears the client's failures; a right code doesn't
- [ ] A right password that lands while the same client's wrong attempts are still being checked leaves those in their places, and each is recorded when its verdict arrives
- [ ] A place reserved before a window ends and judged wrong after it counts as one failure, recorded when the verdict arrives
- [ ] Wrong codes from many addresses in one IPv6 /64 share one limit, and `::ffff:203.0.113.7` shares one with `203.0.113.7` and not with other IPv4 clients
- [ ] After the budget is spent, a right code from a fresh client gets 429 with `Retry-After`, and works again once the window passes
- [ ] No more than 2 password checks run at the same time, `/setup`'s included, and a request that finds the queue full gets 429 and leaves the client's limit as it was
- [ ] With the code map full, a new client is refused on `/login/code`, and an existing client's unexpired failures are still counted
- [ ] With the login map full, the right password from a new client signs in on `/login`
- [ ] A limit that trips writes one log line, and the refusals that follow write none until it clears and trips again
- [ ] `SECURITY.md`'s known gaps give the arithmetic with the number of live codes, what the limit costs, and the three things it leaves
- [ ] The PR's CI `gate` job passes on GitHub
