# 27: The templates, finished

**What to build:** The templates are what an owner gets and reads first. The review found small faults across them that a careful reader would take as a sign of the rest ([review](../research/review-2026-11-09.md), "Templates"). This ticket is the tidying. The hub's sign-in flows moved to [ticket 36](36-the-hubs-sign-in-flows.md), and the build's layout to [ticket 35](35-robkit-sets-a-server-builds-layout.md).

- **Every stack's page.** Each sets a viewport, and its title is the app's name, not "Example". The stack `AGENTS.md` of an added app doesn't talk about "the example". The React + Hono stack's `AGENTS.md` says "a `app.get`": make it "an".
- **Error states.** The Go page shows a message when `/api/me` fails. Start's button handles a failed call and can't submit twice. Admin's copy button handles a refused clipboard and clears its timer. Each call from a page has a deadline, as the conventions ask.
- **The Go server.** `GET /assets/` answers the page or a 404, never a folder listing.
- **turbo.** The install's `turbo.json` makes an app's tasks depend on the shared packages it uses, so a change to `packages/theme` or `packages/core-client` isn't answered from cache.
- **Admin's tests.** "Save access", revoke and copy have unit tests, each for the call that works and the call that fails. Each stack's own page test comes from ticket 08.
- **`next/image` and a file in `public`.** Next's optimizer fetches a `public` file through its own server with no cookie, so the guard turns it away and `<Image src="/logo.png">` shows a broken image. That was read in Next's source and not run. Run it in a built Next app first. Then keep the guard as it is, and say in the Next stack's `AGENTS.md` which images work: one the page imports, and a `public` file in `<img>` or in `<Image unoptimized>`. Add a test that holds what the docs say. Don't change the guard's matcher, and don't turn optimizing off for every image.
- **Read them as an owner would.** Milestone 3 added sections to the install's `README.md` and `AGENTS.md`, and one on upgrading to each stack's `AGENTS.md`. Fix what reads wrong while you are in these files.
- **Installs that exist.** `robkit upgrade` doesn't rewrite the hub, admin, an app or `turbo.json`. The changeset names `create-robkit` and lists what an owner copies by hand.

A medium-effort worker builds this. If a bullet turns out to change how sign-in or the guard behaves, stop and report.

**Blocked by:** 06, 08, 11, 23

**Status:** ready-for-agent

- [ ] Every stack's page has a viewport and the app's name as its title, checked in the generator's tests
- [ ] No added app's `AGENTS.md` says "the example", and the React + Hono one says "an `app.get`"
- [ ] Each error state above has a test: the Go page, Start's button twice and failing, admin's copy refused
- [ ] The Go server's `GET /assets/` never lists a folder
- [ ] Editing `packages/theme/theme.css` and running `pnpm build` rebuilds the hub, and editing `packages/core-client` rebuilds an app that uses it
- [ ] Admin's "Save access", revoke and copy each have a test for success and for failure
- [ ] The Next stack's `AGENTS.md` says which images work, and a test holds it in a built Next app
- [ ] The changeset names `create-robkit` and lists what an existing install copies by hand
- [ ] axe still passes on every page in the whole-stack test
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### From milestone 2's code round, added by the lead

Two things the round on milestone 2's code (PR 89) left for this ticket. Milestone 4's ticket round should decide whether each becomes a bullet above.

- **The build's layout is still in the owner's Vite config.** The react-hono and Express templates' `vite.config.ts` hold `build: { ssr: "src/serve.ts", outDir: "dist", ssrEmitAssets: true }`. The `start` script's `dist/serve.js` and `serve()`'s default `dist/assets` both depend on it, so an owner who edits `build` breaks production with nothing to say why. Opus proposed that `robkit()` set it, as `robkit({ serve: "src/serve.ts" })` or by default. Ticket 10 left `build` with the app on purpose, so this reverses a line of that ticket.
- **`next/image` can't show a file from `public`.** Next's optimizer fetches the file through its own server with no cookie (`fetchInternalImage` in Next 16.4.5 sends empty headers), the guard turns that request away, and `/_next/image` answers an error. An image the page imports works, since it is built into `/_next/static`. So the guard does cover `public`, as `SECURITY.md` says, but an owner who writes `<Image src="/logo.png">` gets a broken image. I read this in Next's source and didn't run it. Run it, then say in the Next stack's `AGENTS.md` which images work, or serve `public` another way.

### From milestone 3, added by the lead

- **A typo ticket 20 left**, since a template change needs a changeset: the React + Hono stack's `AGENTS.md` says "a `app.get`".
- Milestone 3 added sections to the install's `README.md` and `AGENTS.md`: settings for `pnpm dev`, adding and removing apps, upgrading robkit, and an app's own settings. Each stack's `AGENTS.md` gained a short one on upgrading. Read them as an owner would while you are in these files.
- The docs site (the `docs-site` branch) writes a guide for each stack from the templates as they are, and takes screenshots of the hub. Say in this ticket's comments what a reader of those guides would see differently after it, and which screens changed. The docs site's last build ticket (26) works from that.

### From the ticket round, 2026-11-11

The round split this ticket in three, so the basic tidying can go to a medium-effort worker, as R asked on 2026-11-10, and the two parts that aren't tidying get a ticket and a PR each.

- **The hub's sign-in flows** are [ticket 36](36-the-hubs-sign-in-flows.md), at high effort. They close a known gap in `SECURITY.md`.
- **The build's layout** is [ticket 35](35-robkit-sets-a-server-builds-layout.md). Both reviewers said yes to the first question above, as an option to `robkit()` for the two stacks that build a server with Vite.

Taken here:

- Both, on the second question above: keep the guard on `public`, reproduce the broken image first, then document which images work. Neither would change the matcher.
- Sol and Opus: bullets that had no criterion now have one each (Go's `/assets/`, "the example", the typo, admin's flows for success and failure).
- Sol: the turbo criterion covers `packages/core-client` as well as the theme.
- Both: `robkit upgrade` doesn't reach these files, so the changeset says what to copy.

Also from the round, for the lead: the PRD's out-of-scope line said anything in an app's `public` folder is public. For Next that contradicts `SECURITY.md`, where `public` goes through the guard. The lead corrected the PRD.
