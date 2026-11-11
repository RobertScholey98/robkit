# 43: The Next template's AGENTS.md says when the guard refuses an image

**What to build:** The Next template's `AGENTS.md`, in its "Images" section, says the image optimizer behind `<Image>` fetches a file in `public` with no cookie, "So the guard refuses it with a 401, and `<Image src="/logo.png">` shows a broken image."

That holds only for an app that isn't open to anyone. For an open app, the guard lets a request with no session through as `nobody` (`packages/guard/src/guard.ts:114`), so the optimizer gets the file. An agent reading the section in an open app would avoid `<Image>` for no reason.

- Say the 401 is for an app that isn't open to anyone, as the docs site's Next.js guide now does.

Found while reading the site against milestone 4, in docs-site ticket 26.

**Blocked by:** none

**Status:** needs-triage

- [ ] The Images section in `packages/create-robkit/templates/stacks/next/AGENTS.md` says an open app's optimizer gets the file
- [ ] The changeset names create-robkit
