# 29: Access codes are at least 5 characters

**What to build:** Ticket 04 hardens the sign-in limit, with an install-wide budget of 20 wrong codes an hour. That makes a generated 5-character code take years to guess. A custom code can be 3 characters, and there are only 46,656 of those: at 480 guesses a day, every one is tried in about three months, and sooner when more than one short code is live. The limit can't fix that; only the length can.

**Blocked by:** 04

**Status:** needs-info

**Open:**

- Should an install that isn't local stop accepting codes shorter than 5 characters? R chose on 2026-11-09 to keep generated codes at 5 and harden the limit, which doesn't say what happens to shorter custom codes that already exist.

  Recommended: yes. Admin refuses to create or change a code to under 5 characters. On an install that isn't local, sign-in refuses one too, and admin shows it as not working, with why, so the owner can replace it. A local install still takes `test`. The cost is that a guest holding a 3- or 4-character code must be given a new one. Nothing is published, so only R's own installs hold such codes.

  The other choice is to leave short codes working and say in `SECURITY.md` that a 3-character code can be guessed in weeks.

**If yes, the criteria would be:**

- [ ] Admin refuses a new or changed code under 5 characters, with a message that says the minimum
- [ ] On an install that isn't local, a 3-character code no longer signs in, and admin shows it as not working and says why
- [ ] A local install still takes `test`
- [ ] The changeset says shorter codes need replacing
- [ ] `SECURITY.md`'s known gaps lose the line about short codes
