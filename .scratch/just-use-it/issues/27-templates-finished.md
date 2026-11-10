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

## Comments

### From milestone 2's code round, added by the lead

Two things the round on milestone 2's code (PR 89) left for this ticket. Milestone 4's ticket round should decide whether each becomes a bullet above.

- **The build's layout is still in the owner's Vite config.** The react-hono and Express templates' `vite.config.ts` hold `build: { ssr: "src/serve.ts", outDir: "dist", ssrEmitAssets: true }`. The `start` script's `dist/serve.js` and `serve()`'s default `dist/assets` both depend on it, so an owner who edits `build` breaks production with nothing to say why. Opus proposed that `robkit()` set it, as `robkit({ serve: "src/serve.ts" })` or by default. Ticket 10 left `build` with the app on purpose, so this reverses a line of that ticket.
- **`next/image` can't show a file from `public`.** Next's optimizer fetches the file through its own server with no cookie (`fetchInternalImage` in Next 16.4.5 sends empty headers), the guard turns that request away, and `/_next/image` answers an error. An image the page imports works, since it is built into `/_next/static`. So the guard does cover `public`, as `SECURITY.md` says, but an owner who writes `<Image src="/logo.png">` gets a broken image. I read this in Next's source and didn't run it. Run it, then say in the Next stack's `AGENTS.md` which images work, or serve `public` another way.
