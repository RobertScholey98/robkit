# 31: Password sign-in under a flood

**What to build:** Ticket 04 lets at most 2 password checks run at once, with a short queue, and answers 429 when the queue is full. Someone with many addresses can keep that queue full: one IPv6 /48 holds 65,536 separate /64s, each a new client with free places. While they keep it up, the owner's right password gets 429. The council's fifth round found this (2026-11-09).

What it does and doesn't touch:

- A browser that is already signed in is unaffected. Its session renews without the password.
- Guests' access codes aren't affected by this flood. They have their own budget, which R accepted on 2026-11-09.
- It is no worse than today. The same flood now queues 32 MB checks without limit, and the owner's request waits behind them.
- The owner runs the host, so they can block the flood at the proxy or at Cloudflare.

**Blocked by:** 04

**Status:** needs-info

**Open:**

- Is it enough to say this in `SECURITY.md`, or should core keep a way in for the owner during a flood?

  Recommended: say it in `SECURITY.md` and build nothing more. The flood gains an attacker nothing but denial, it needs many addresses for as long as it lasts, and it can't touch an owner who is signed in. Ticket 04 already writes the gap down in these words.

  The other choice is a place in the queue that a flood can't take. Core would set a second cookie when the owner signs in, signed and good for a year, that says "this browser has been the owner". A `/login` that carries it waits in a queue of its own. That keeps the owner's usual browsers working through a flood. A new device still gets 429. The cost is a new cookie and a new kind of signed token to keep right.

**If R picks the second choice, the criteria would be:**

- [ ] Signing in as the owner sets the cookie, host-only and `__Host-` prefixed on an https install
- [ ] With the ordinary queue full, a `/login` that carries a valid cookie is still checked, and one that carries a forged or expired one gets 429
- [ ] The cookie signs nobody in by itself, and a guest's sign-in never sets it
- [ ] `SECURITY.md`'s known gap says a flood stops only browsers that have never signed in as the owner
