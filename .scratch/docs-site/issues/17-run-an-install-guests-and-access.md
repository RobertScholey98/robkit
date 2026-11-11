# 17: Run an install: guests, access codes and roles

**What to build:** The page on who gets in. Claiming the install, making an access code in admin, roles, who may open each app, intro links, and what a guest sees from the link to the app.

It says what protects sign-in and what doesn't, from `SECURITY.md`: how many wrong codes the install takes in an hour, and what a short code of the owner's own choosing risks.

Milestone 4 may change two things here: an intro link opened by someone already signed in will ask first (ticket 27 of "Just use it"), and codes under 5 characters may be refused if R says so (ticket 29). Write what the code does on this branch, and list both in the comments.

**Blocked by:** 03, 05

**Status:** done

- [x] The page matches what admin and the hub do, checked in an install made from this checkout, and the Proof says how
- [x] The numbers on the page are the ones `SECURITY.md` and the code give
- [x] The comments list what tickets 27 and 29 of "Just use it" would change on the page
- [x] The PR's CI `gate` job passes on GitHub

## Comments

**What I chose**

- One page, `run-an-install/guests-and-access`: Claim the install / Make an access code / Give guests roles / Choose who may open each app / What a guest sees / Take a code back / What protects sign-in.
- It names admin's fields, buttons and messages as admin shows them, and gives each limit as the code sets it: a name of 1 to 80 characters, a code of 3 to 32, a role name of 1 to 40, a password of at least 12.
- What protects sign-in gives both limits, the odds from `SECURITY.md`, what the install-wide limit costs, and what a short code of the owner's own risks. It points to `SECURITY.md` for the rest.
- The page says what a guest sees when a code is revoked, from the launcher's 30-second refresh and the app token's 15 minutes.

**Proof**

- A new built-site test reads `sign-in-limits.ts` and `session-claims.ts`, and holds the page's tries, windows, install-wide limit and 30 days to them. A second reads `SECURITY.md`'s odds and its line on 3-character codes, and holds the page's sentences to them. A third checks the page isn't a stub. I wrote them after the page, and saw them fail only on a mistake in the test, an apostrophe the build turns into an entity.
- I read the other numbers in the code: `access-codes.ts` (1 to 80, 3 to 32, `TEST`), `roles.ts` (1 to 40), `owner.ts` (12), the `0002_roles.sql` migration (Family and Friends), `launcher.tsx` (30 s) and `@robkit/session` (15 minutes).
- In WSL, in an install made with `pnpm create-install --stack react-hono` from this branch, with Postgres on port 25439 and `notes` added for the owner only, a script drove the hub and admin in Chromium:
  - The hub asked for a username and password, then signed the owner in.
  - A code left blank came out as 5 characters (`XP344`). `ali22` came out as `ALI22`. Minting `ALI22` again gave "That code is taken."
  - A Book club role holding Sam, and notes set to Guests with a role and Book club, saved with "Saved. The app picks it up within a minute."
  - After a minute, Sam's intro link in a fresh browser signed Sam in. The launcher showed notes, and notes opened. example answered 404 "Not found".
  - Bo, with no role, saw "No apps yet." and "Apps shared with you show up here."
  - The owner, signed in, opening Sam's link saw "Sign in with this link instead?". Staying kept the owner signed in.
  - "  ali22 " typed at the sign-in form signed Ali in.
  - Wrong codes 1 to 10 got "That code doesn't work.". The 11th got "Too many attempts. Try again in 15 minutes."
  - Revoking Sam's code showed Revoked in admin, and Sam's hub showed the sign-in page at once on its next load.
- `run-an-install.browser.test.ts` runs axe on the page at 375 and 1280 pixels in both themes, and checks it doesn't scroll sideways at 375 pixels.
- The site's build, lint, typecheck and all 244 tests pass at 100% coverage.

**What the next tickets need**

- `run17.sh` and `run17-drive.mjs` in the scratchpad drive admin and the hub as the owner and as guests. Base UI's radios render twice, so pick one with `getByRole("radio", { name })` and `.click()`, not `getByLabel`.
- An app's access rule takes up to a minute to reach the app, so a script that saves one and then opens the app waits 65 seconds.
- Add each new Run an install page to `run-an-install.browser.test.ts`.

**What "Just use it" tickets 27 and 29 change**

- The intro link's question moved from ticket 27 to [ticket 36](../../just-use-it/issues/36-the-hubs-sign-in-flows.md), which is done and merged. The page describes it as the code does now, and the run above saw it.
- [Ticket 29](../../just-use-it/issues/29-access-codes-at-least-five.md) is still `needs-info`. Codes of 3 and 4 characters work today, and the page says so and warns against them. If R says yes, the page's "A code of your own is 3 to 32" becomes 5 to 32, the short-code warning becomes a sentence on what happens to an old short code, and the built-site test's `SECURITY.md` line changes with it.

### Merged

Added by the lead. PR 135 merged into `docs-site` on 2026-11-11 as `1ec27c28`. Its own `gate` was still running on `bc25e9f` then. The box is ticked on PR 136's `gate`, which passed on `3b5c9ff`. PR 136 is stacked on this one and holds its commits, and the tree merged into `docs-site` equals PR 136's head.
