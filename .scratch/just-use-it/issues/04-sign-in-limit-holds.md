# 04: The sign-in limit holds under load

**What to build:** A generated access code is 5 characters from 31, about 28.6 million. The only brake on guessing is 10 failures per 15 minutes per exact address, and it can be got around three ways: rotate addresses inside one IPv6 /64, send a burst before the first verdict comes back, or do both ([review](../research/review-2026-11-09.md), "Core"). R chose to keep codes at 5 characters and harden the limit (2026-11-09).

- **An attempt is reserved before its verdict.** `/login` and `/login/code` each take a place in the client's limit, and `/login/code` one in the install's budget, before they `await` the check. A request that finds no place free gets 429 without a check, right code or wrong.
- **Every reservation ends one of two ways.** It becomes a recorded failure when the check says wrong, or it is released: when the sign-in succeeds, when the install is unclaimed, when the check throws, as it does with the database down, and when a request holds a place in the client's limit but finds the install's budget spent. Release it in a `finally`, so no path leaks a place. A leaked place in the install's budget would stop code sign-in until core restarts.
- **A 429 always says when to come back.** `Retry-After` is at least 1 second. Three refusals have no failure to count from: a client whose places are all still being checked, a full map and a full queue. `tooManyAttempts` rounds its message up to minutes today, so a 1-second wait would read "in 1 minute". Under a minute, the message gives seconds.
- **What success clears.** A right code releases its own place and nothing else: it must never clear the client's earlier failures, for the reason the comment in `routes/session.ts` gives. A right password still clears the client's recorded failures, as `/login` does today. It leaves the client's other attempts that are still being checked in their places, and each of those ends as its own verdict says.
- **A place outlives its window.** A place reserved before a window ends is held until its verdict, and a wrong verdict is recorded at the time it arrives.
- **Clients are keyed by network.** `clientOf` keys an IPv6 address by its first 64 bits. An IPv4-mapped IPv6 address, such as the `::ffff:a.b.c.d` the dev proxy writes, counts as its IPv4 address, in either spelling: `::ffff:203.0.113.7` and `::ffff:cb00:7107` are one address. IPv4 stays whole. An address that won't parse stays its own key, as today: a proxy that writes addresses in a shape core doesn't know, such as `ip:port`, must not put every visitor in one limit. A missing header still counts as `unknown`.
- **An install-wide budget for wrong codes.** After 20 wrong codes across all clients in an hour, `/login/code` answers 429 to everyone until the window passes. This is the trade R accepted: an attacker can stop new code sign-ins for a while. Signed-in guests and the owner's password sign-in are unaffected.
- **Honest arithmetic.** An attacker wants any live code, not one in particular. At 20 guesses an hour, trying all 28.6 million takes about 163 years, however many codes are live. What changes with the number of live codes is how soon the first hit is expected: after about N ÷ (k + 1) guesses, where N is the 28.6 million possible codes and k is the number live. That is about 82 years with one live code and about 8 years with 20, which is about a 12% chance of a hit in a year. The constants carry a comment that shows this sum, and `SECURITY.md` gives it the same way, with the number of live codes in it.
- **Password checks are bounded.** At most 2 scrypt checks run at once, wherever a hash is made or checked: the cap sits in `password.ts`, so `/setup` on an unclaimed install is covered too. Node runs scrypt on a pool of 4 threads that it shares with DNS lookups, which every new Postgres connection needs, so the cap stays below 4 to leave threads free. A small fixed number of checks wait their turn. A request that finds the queue full gets 429 with `Retry-After`, and releases its place; `/setup` gets the same 429. Say the reason in the comment.
- **The limiter is bounded, and a full one doesn't refuse a password.** Each limiter's map holds at most 100,000 clients, and pruning doesn't walk every client on every failure. A failure that hasn't expired is never evicted to make room, or rotating addresses would wipe a client's count. When a map is full, what happens to a client not yet in it depends on the route:
  - `/login/code` refuses it with 429. The install's budget already holds wrong codes to 20 an hour, so this map fills only if something else is wrong.
  - `/login` lets it try and doesn't count it. Refusing would let someone with many addresses fill the map once and shut the owner out for the whole window. The cap on password checks is the brake then.

  The size is an estimate, and its comment shows the sum with the check time it assumes: at 2 checks at once and 30 ms a check, a window holds about 60,000 wrong passwords. Measure a check on the machine the tests run on and say what you measured.
- **The limits can be set from a test.** `sessionRoutes` builds its limiters from constants today, and `password.ts` calls scrypt directly, so no test could fill a map of 100,000 or see how many checks run at once. The limits, the window, the map's size, the cap on checks and the queue's length become settable where core is made, with the values here as defaults. One optional setting on `createApp` is enough. Say in its comment that it is there for tests and tuning. The cap can't be state at the top of `password.ts`, or two apps in one test process would share it: `password.ts` exports what makes a bounded checker, `createApp` makes one and hands it on through its context, and `claimInstall` uses the same one. To see how many checks run at once, a test puts a slow fake in scrypt's place.
- **Core says when a limit trips, once.** One log line when a client, the install, a map or the queue of password checks reaches its limit, with the client's key and never the code tried. The requests it then refuses log nothing until that limit has cleared and trips again, or a flood of refusals would fill the log.

Three things this leaves, to say in `SECURITY.md`'s known gaps, in these words or plainer:

- A 3-character code stays guessable in weeks. [Ticket 29](29-access-codes-at-least-five.md) takes that and waits for R.
- Someone with many addresses can stop the owner signing in with the password for as long as they keep it up. Each request comes from a new client with a free place, so a steady flood keeps the queue of password checks full and the owner's right password gets 429. A browser that is already signed in is unaffected, because its session renews without the password. This is no worse than today, when the same flood queues checks without limit. [Ticket 31](31-password-sign-in-under-a-flood.md) asks R whether to do more.
- With many addresses the limit per client stops counting, so the rate of password guesses is whatever the cap on checks allows.

This ticket also removes the gap `SECURITY.md` lists today, "The sign-in limit is soft".

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] A burst of 100 concurrent wrong sign-ins from one client gets at most the limit's worth of verdicts, for both routes
- [ ] A burst of wrong codes from many clients at once never gets more verdicts than the install's budget
- [ ] In a burst that mixes right and wrong codes, each right one that got a place signs in and releases only its own place
- [ ] A check that throws leaves the client's limit and the install's budget as they were, and so does a sign-in on an unclaimed install
- [ ] A right password clears the client's failures; a right code doesn't
- [ ] A right password that lands while the same client's wrong attempts are still being checked leaves those in their places, and each is recorded when its verdict arrives
- [ ] A place reserved before a window ends and judged wrong after it counts as one failure, recorded when the verdict arrives
- [ ] Wrong codes from many addresses in one IPv6 /64 share one limit, and `::ffff:203.0.113.7` and `::ffff:cb00:7107` share one with `203.0.113.7` and not with other IPv4 clients
- [ ] After the budget is spent, a right code from a fresh client gets 429 with `Retry-After`, and works again once the window passes
- [ ] A client that holds a place but finds the budget spent gets 429, and its limit is as it was
- [ ] Every 429 carries a `Retry-After` of at least 1 second, the three refusals with no failure to count from included, and its message gives seconds when the wait is under a minute
- [ ] An address that won't parse is its own key, and a missing one is `unknown`
- [ ] No more than 2 password checks run at the same time, `/setup`'s included, and a request that finds the queue full gets 429 and leaves the client's limit as it was
- [ ] With a small map set and full, a new client is refused on `/login/code`, and an existing client's unexpired failures are still counted
- [ ] With a small map set and full, the right password from a new client signs in on `/login`
- [ ] A limit that trips writes one log line, and the refusals that follow write none until it clears and trips again
- [ ] `SECURITY.md`'s known gaps give the arithmetic with the number of live codes, what the limit costs, and the three things it leaves, and no longer say the limit is soft
- [ ] The PR's CI `gate` job passes on GitHub
