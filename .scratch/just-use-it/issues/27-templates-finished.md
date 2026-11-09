# 27: The templates, finished

**What to build:** The templates are what an owner gets and reads first. The review found small faults across them that a careful reader would take as a sign of the rest ([review](../research/review-2026-11-09.md), "Templates").

- **The hub.** An intro link opened while someone is already signed in asks before it replaces the session. A visitor who is already signed in and arrives with `next` goes there. The launcher notices sign-out, in this tab or another, and shows the sign-in page.
- **Every stack's page.** Each sets a viewport, and its title is the app's name, not "Example". The stack `AGENTS.md` of an added app doesn't talk about "the example".
- **Error states.** The Go page shows a message when `/api/me` fails. Start's button handles a failed call and can't submit twice. Admin's copy button handles a refused clipboard and clears its timer. Each call from a page has a deadline, as the conventions ask.
- **The Go server.** `GET /assets/` answers the page or a 404, never a folder listing.
- **turbo.** The install's `turbo.json` makes an app's tasks depend on the shared packages it uses, so a change to `packages/theme` or `packages/core-client` isn't answered from cache.
- **Tests.** The hub's sign-in, `next` and intro-link flows, and admin's "Save access", revoke and copy, have unit tests. Each stack's own page test comes from ticket 08.

**Blocked by:** 06, 08, 11, 23

**Status:** ready-for-agent

- [ ] An intro link in a signed-in browser asks first, and leaves the session alone on "no"
- [ ] The launcher shows the sign-in page within a poll of signing out elsewhere
- [ ] Every stack's page has a viewport and the app's name as its title, checked in the generator's tests
- [ ] Each error state above has a test
- [ ] Editing `packages/theme/theme.css` and running `pnpm build` rebuilds the hub
- [ ] axe still passes on every page in the whole-stack test
- [ ] The PR's CI `gate` job passes on GitHub
