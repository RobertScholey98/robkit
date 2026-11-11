# 09: Build an app: the viewer, the guard and its tests

**What to build:** The pages a builder reads, whatever their stack, about who is looking at their app.

- **The viewer and the guard.** What `guarded()` does for an app, what a handler gets as the viewer (an owner, a guest, their roles), and what the browser sees when someone isn't signed in or may not open the app. What an app must leave to the guard: it never reads the session cookie or verifies a token itself.
- **Writes.** On the same page: why a write goes on POST, PUT, PATCH or DELETE, what the guard refuses from another origin, and how an app allows a framer.
- **Testing with a viewer.** The stacks differ, so the page shows each one's own way, with the stack switcher. React + Hono and React + Express mount their routes behind `guardedAs(viewer)` from the adapter's `/testing` entry. TanStack Start and Next.js call the plain function a handler hands the viewer to, with a viewer the same entry builds, since a server function doesn't run outside Start or Next itself. Go hands a handler its viewer with `session.WithViewer`. The page shows each stack's own test file from the templates, with ticket 05's component, and says what such a test doesn't cover: the real guard, which the whole-stack tests exercise.

Each page follows "The words" in the [PRD](../PRD.md). The sources are each stack's `AGENTS.md` (its sections on the viewer and on testing), `SECURITY.md`, and the adapters' READMEs.

**Blocked by:** 03, 05

**Status:** ready-for-agent

- [ ] Every sample compiles, for every stack it shows
- [ ] The testing page shows a test file from each of the five stacks' templates, and says for each what it doesn't cover
- [ ] The pages agree with `SECURITY.md` on what the guard does and doesn't do, and the Proof names the passages checked
- [ ] The page on writes names the methods the guard treats as writes, from the code
- [ ] The PR's CI `gate` job passes on GitHub
