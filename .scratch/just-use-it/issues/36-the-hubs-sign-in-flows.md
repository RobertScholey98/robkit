# 36: The hub's sign-in flows, finished

**What to build:** Three things the hub does at sign-in that the review found wrong ([review](../research/review-2026-11-09.md), "Templates"). They were part of [ticket 27](27-templates-finished.md). Milestone 4's ticket round moved them here, since they change how a session starts and ends, and one closes a known gap in `SECURITY.md`.

- **An intro link asks before it replaces a session.** Today the hub signs a browser in with whatever access code an intro link carries, even when someone is already signed in. So an app on a sibling subdomain can send a viewer to an intro link of its own and swap their session for a guest's. When someone is already signed in, the hub now says who they are signed in as and asks whether to sign in with the link instead. It sends core nothing until they say yes. "No" leaves the session as it was. "Yes" signs in once. A browser that isn't signed in is signed in as today, without a question.
- **A signed-in visitor who arrives with `next` goes there.** Today `next` is followed only after a new sign-in, so someone already signed in lands on the launcher. The hub follows a `next` it would follow after sign-in, by the same rule, and ignores any other.
- **It forwards once.** A guard that sends a signed-in browser back to the hub would otherwise loop, and a browser that sends no fetch metadata does exactly that (the PRD's out-of-scope list has it). The hub forwards to a given `next` at most once in a visit. A browser that comes back with the same `next` sees the launcher, with a line that says the app sent it back.
- **The launcher notices sign-out.** Today it asks core for the app list on a timer, and an empty list isn't a sign-out. While its tab is visible, and when a hidden tab becomes visible, the launcher checks the session. Signed out, in this tab or another, shows the sign-in page. A core that can't be reached shows a failure the viewer can retry, never the sign-in page.
- **Tests.** The hub's sign-in, `next` and intro-link flows have unit tests.
- **Docs.** `SECURITY.md`'s known gap about intro links goes, and the trust model says what the hub does. The install's `AGENTS.md` and the hub's own comments match.
- **Installs that exist.** The hub is the owner's copy, and `robkit upgrade` doesn't rewrite it. The changeset names `create-robkit`, says the intro-link change closes a gap, and names the files to copy.

The words on the question and on the "sent you back" line are the worker's, in the hub's voice. Write them in the ticket's comments, since the docs site shows the hub.

**Blocked by:** 06

**Status:** done

- [x] An intro link in a signed-in browser asks first, and sends core no sign-in request before the answer
- [x] "No" leaves the session as it was, and "yes" replaces it with one sign-in request
- [x] An intro link in a browser that isn't signed in signs in without a question
- [x] A signed-in visitor with a `next` the hub would follow after sign-in goes there, and one with any other `next` sees the launcher
- [x] A browser that comes back with the same `next` sees the launcher and the line, and isn't forwarded again
- [x] The launcher shows the sign-in page within a poll of signing out elsewhere, and on becoming visible
- [x] With core unreachable the launcher shows a failure to retry, not the sign-in page
- [x] `SECURITY.md`'s known gaps no longer list the intro link, and the changeset says what an existing install copies
- [x] axe still passes on every hub page in the whole-stack test
- [x] The PR's CI `gate` job passes on GitHub

## Comments

### From the ticket round, 2026-11-11

- Sol: asserting that a question appears would pass with the session already replaced. The criteria now say no request is sent before the answer, and that "no" leaves the session alone.
- Sol: the launcher polls the app list (`launcher.tsx`), which doesn't tell a sign-out from an owner with no apps, and an unreachable core isn't a sign-out.
- Opus: forwarding a signed-in visitor can loop when a guard sends them straight back, so the hub forwards once.
- Sol: `App.tsx` follows `next` only in `onSignedIn`. The first check of the session, which finds someone already signed in, skips it.

The docs site, built beside this milestone on the `docs-site` branch, shows the hub's sign-in and its launcher, and takes screenshots of both. Say in these comments what a guest sees differently afterwards. The docs site's last build ticket (26) works from that.

Order: [ticket 27](27-templates-finished.md) edits other files in the same templates. Whichever merges second merges the milestone's branch in first.

### Built, 2026-11-11

Chosen in the build:

- The hub now asks core for the session before it uses an intro link's code. Signed in: it asks. Not signed in, or unclaimed: it signs in with the code as before. Core can't be reached: the "Core is unreachable" card, as on any other visit.
- "Yes" with a code core refuses keeps the question on screen, with core's sentence under the buttons. The browser is still signed in, so the sign-in form would be wrong there.
- An intro link still drops any `next` it carries, as it did before.
- Forwarding once lives in `apps/hub/src/forwarded.ts`. The hub notes each `next` it sends a tab to in `sessionStorage`, one key per address (`robkit-hub-forwarded <next>`). That storage is the hub's own origin and lasts as long as the tab, which is the visit. The URL can't hold it, since the app that sends the browser back writes the URL. Nothing clears a note within the tab. If the tab's storage refuses, the hub doesn't forward a signed-in visitor, so it can't loop.
- A sign-in always forwards to `next`, even one the tab went to before, since a person just acted. It notes the forward too, so an app that sends them straight back sees the line.
- `returnTo`'s rule accepts any slug-shaped label beside the hub, the hub's own origin included. The brief said not to write a second rule, so a signed-in visitor with `next` set to the hub is forwarded to the hub's root, once. It can't loop, since that address has no `next`.
- The launcher checks the session before each listing. A session that is now someone else's, as after "yes" to an intro link in another tab, moves the launcher to them. A failure from either call shows the sentence `callCore` gives, such as "Couldn't reach core at https://core.example.com.", with a "Try again" button that asks again at once.
- The whole-stack test's axe journey now opens two more hub pages as the owner: the question for an intro link (`hub-intro-question`), and the launcher an app sent the owner back to (`launcher-sent-back`). With `E2E_SCREENSHOTS` set, each is saved under those names.

### For the docs site

What a guest or an owner sees differently:

- **An intro link while signed in.** A card, under "robkit hub":
  - Heading: "Sign in with this link instead?"
  - Text: "You're signed in as Grandma. Only switch if someone sent you this link."
  - Buttons: "Sign in with the link" and "Stay signed in as Grandma".
  - "Sign in with the link" signs in with the link's code and opens the launcher as the link's guest. A code core refuses shows core's sentence under the buttons. "Stay signed in as Grandma" opens the launcher as before.
- **An intro link while not signed in** signs in with no question, as before.
- **Signed in already, arriving from an app.** The hub sends the browser straight on to the app, where before it showed the launcher. If the app sends the browser back with the same address in the same tab, the launcher shows, with this line above the apps: "notes.example.com sent you straight back here. Try opening it again below." The line names the app's host.
- **Signing out in another tab.** An open launcher shows the sign-in page within 30 seconds, or as soon as its tab is shown again.
- **Core can't be reached while the launcher is open.** The launcher stays, with core's sentence, such as "Couldn't reach core at https://core.example.com.", and a "Try again" button. Before, it showed the same sentence with no button.

An app's author sees no change, and core's routes are the same.

### Merged

Added by the lead. PR 109 merged into `m4-nothing-skipped` on 2026-11-11, with `gate` green on `aba1446`. The lead read the diff and changed nothing.

The map no longer lists the intro link among the known gaps.

One thing for R to know, not a fault: the launcher now makes two calls to core at each poll, one for the session and one for the apps, where it made one.

### From the code round, 2026-11-11

Milestone 4's code had its one council round at `6ec738ed`. Opus 5.5 gave it 7.5 out of 10 and Sol 6.1 gave 7, and neither would merge it as it stood. I checked each finding against the code before I acted on it. These are the ones about this ticket.

Taken, each in a commit of its own with a test that failed first:

- **The hub forwards only when the tab kept its note** (Sol, must-change, `2e37205e`). A full `sessionStorage` answers a read and refuses each write. The hub then forwarded a signed-in visitor with no note, so an app that sent them straight back was forwarded to again, and nothing stopped the loop. `noteForward` now answers whether the browser kept the note, and the hub forwards by itself only when it did. A sign-in still goes on to the app, since a person signs in each time. The test that covered a storage that refuses made the read throw too, which took the safe path.
- **No line about an app sending the visitor back when the storage can't be read** (Opus, should-change, `89dcb4b4`). When the read threw, the hub stayed on the launcher, which is right, but said an app had sent the visitor back. `forwardedBefore` now answers undefined when the browser won't say, and the launcher shows without that line.

`SECURITY.md` and the `hub-sign-in-flows` changeset say the hub doesn't forward when the browser keeps no note.
