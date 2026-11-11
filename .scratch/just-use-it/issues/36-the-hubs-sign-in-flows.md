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

**Status:** ready-for-agent

- [ ] An intro link in a signed-in browser asks first, and sends core no sign-in request before the answer
- [ ] "No" leaves the session as it was, and "yes" replaces it with one sign-in request
- [ ] An intro link in a browser that isn't signed in signs in without a question
- [ ] A signed-in visitor with a `next` the hub would follow after sign-in goes there, and one with any other `next` sees the launcher
- [ ] A browser that comes back with the same `next` sees the launcher and the line, and isn't forwarded again
- [ ] The launcher shows the sign-in page within a poll of signing out elsewhere, and on becoming visible
- [ ] With core unreachable the launcher shows a failure to retry, not the sign-in page
- [ ] `SECURITY.md`'s known gaps no longer list the intro link, and the changeset says what an existing install copies
- [ ] axe still passes on every hub page in the whole-stack test
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### From the ticket round, 2026-11-11

- Sol: asserting that a question appears would pass with the session already replaced. The criteria now say no request is sent before the answer, and that "no" leaves the session alone.
- Sol: the launcher polls the app list (`launcher.tsx`), which doesn't tell a sign-out from an owner with no apps, and an unreachable core isn't a sign-out.
- Opus: forwarding a signed-in visitor can loop when a guard sends them straight back, so the hub forwards once.
- Sol: `App.tsx` follows `next` only in `onSignedIn`. The first check of the session, which finds someone already signed in, skips it.

The docs site, built beside this milestone on the `docs-site` branch, shows the hub's sign-in and its launcher, and takes screenshots of both. Say in these comments what a guest sees differently afterwards. The docs site's last build ticket (26) works from that.

Order: [ticket 27](27-templates-finished.md) edits other files in the same templates. Whichever merges second merges the milestone's branch in first.
