# 29: Access codes are at least 5 characters

**What to build:** Ticket 04 hardens the sign-in limit, with an install-wide budget of 20 wrong codes an hour. That makes a generated 5-character code take years to guess. A custom code can be 3 characters, and there are only 46,656 of those: at 480 guesses a day, every one is tried in about three months, and sooner when more than one short code is live. The limit can't fix that; only the length can.

**Blocked by:** 04

**Status:** needs-info

**Open:**

- Should an install that isn't local stop accepting codes shorter than 5 characters? R chose on 2026-11-09 to keep generated codes at 5 and harden the limit, which doesn't say what happens to shorter custom codes that already exist.

  Recommended: yes. Admin refuses to create or change a code to under 5 characters. On an install that isn't local, sign-in refuses one too, and admin shows it as not working, with why, so the owner can replace it. A local install still takes `test`. The cost is that a guest holding a 3- or 4-character code must be given a new one. Nothing is published, so only R's own installs hold such codes.

  The other choice is to leave short codes working and say in `SECURITY.md` that a 3-character code can be guessed in about three months, and sooner when several are live.

- If yes, what happens to a guest who is already signed in with a short code?

  Recommended: they stay signed in until their session would end anyway. Only a new sign-in is refused. The risk this closes is someone guessing a code, and a session that already exists was never guessed. The other choice is to end such a session at its next renewal, which is what the code would do by default: core asks whether a session's code is still good each time it renews one. That signs the guest out soon after the upgrade, before the owner has given them a new code.

**If yes, the criteria would be:**

- [ ] Admin refuses a new or changed code under 5 characters, with a message that says the minimum
- [ ] On an install that isn't local, a 3-character code and a 4-character code no longer sign in, a 5-character one does, and admin shows a short one as not working and says why
- [ ] A guest already signed in with a short code keeps their session, or loses it at the next renewal, as R chose
- [ ] A local install still takes `test`
- [ ] The changeset says shorter codes need replacing
- [ ] `SECURITY.md`'s known gaps lose the line about short codes

## Comments

### From milestone 4's ticket round, 2026-11-11

Both reviewers agree with the recommendation. They differ on a guest who is already signed in, so that is now a second question for R. Sol found that `standingOf` is asked at sign-in and again each time a session renews (`session-store.ts`), so a new standing for a short code would end existing sessions unless the build tells the two apart. Opus would leave such a guest signed in.
