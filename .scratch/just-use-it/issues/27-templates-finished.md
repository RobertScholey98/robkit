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

**Status:** done

- [x] Every stack's page has a viewport and the app's name as its title, checked in the generator's tests
- [x] No added app's `AGENTS.md` says "the example", and the React + Hono one says "an `app.get`"
- [x] Each error state above has a test: the Go page, Start's button twice and failing, admin's copy refused
- [x] The Go server's `GET /assets/` never lists a folder
- [x] Editing `packages/theme/theme.css` and running `pnpm build` rebuilds the hub, and editing `packages/core-client` rebuilds an app that uses it
- [x] Admin's "Save access", revoke and copy each have a test for success and for failure
- [x] The Next stack's `AGENTS.md` says which images work, and a test holds it in a built Next app
- [x] The changeset names `create-robkit` and lists what an existing install copies by hand
- [x] axe still passes on every page in the whole-stack test
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

### From the build, 2026-11-11

**`next/image`, run first.** In the Next example, built with `pnpm build` and served with `node src/serve.ts` behind the guard, with a fake core whose rule lets only the owner in, as the owner:

- `/logo.png` from `public`: 200, `image/png`. With no session: 401, the guard's JSON.
- `/_next/image?url=%2Flogo.png&w=64&q=75`, which `<Image src="/logo.png">` asks for: 401, no content type. The optimizer's own fetch carries no cookie, and the guard's 401 comes back as the answer.
- `/_next/image` for an image the page imports (`/_next/static/media/...`): 200, `image/png`.

So the reading of Next's source was right. The guard and its matcher are unchanged. `tooling/e2e/src/next-images.ts` holds all four, run from `install-checks.test.ts` on the next install after its CI steps built it.

Running it found a second fault: the Next template's `tsconfig.json` excludes `next-env.d.ts`, which held the type of an imported image, so `next build` failed its type check on `import logo from "./logo.png"`. Its `types` now list `next/image-types/global`.

Chosen in the build:

- **Titles.** A stack's page is titled `example`, the example's slug, as `<title>example</title>` or `title: "example"`. `appFiles` in `src/generate.ts`, which already names the manifest after the slug, swaps that for the new app's slug. The example's title is `example`, lowercase, since the slug is the app's name.
- **Viewport on Next.** Next sets one by default; the layout now exports it too, so the generator's test can see it.
- **Go's `/assets/`.** A folder answers with the page, as any other path that isn't a file does, rather than a 404.
- **The Go page's test.** It runs under Vitest in happy-dom, so the Go template gained Vitest and Testing Library, and its `test` script is `go test ./... && vitest run`. The page moved from `src/main.tsx` into `Home` in `src/home.tsx`.
- **Start's test** gained happy-dom and Testing Library too. `HomeCard` now takes the first count and the call, and owns the call's state.
- **Deadlines.** Hub and admin call through `callCore` (10 seconds), and the Go page and Start's server functions through `sessionFetch` (30 seconds), so each already had one. Next's server action and the Hono and Express forms are the framework's or the browser's own calls, with no deadline to set.
- **turbo.** Each task depends on a `transit` task, turbo's documented way to carry a used package's files into a task's hash without running anything in it. `src/install-checks.test.ts` compares turbo's dry-run hashes before and after an edit, rather than running a build twice.
- **Copy's timer** is cleared when the row goes and on each press. No test watches the timer: nothing an owner sees changes.

### For the docs site

- **A stack's guide:** each page's tab shows the app's slug (`example` for the first app, `notes` for an app added as notes), not "Example" or "Start example". Every stack's page sets a viewport, so it fits a phone.
- **The Next guide:** a new section in the Next stack's `AGENTS.md`, "Images": an imported image and a `public` file in `<img>` or `<Image unoptimized>` work; `<Image src="/logo.png">` shows a broken image. A page can now import an image at all.
- **The Go guide:** the page's code is in `src/home.tsx`, with a test in `src/home.test.tsx`, and `pnpm test` runs Vitest after `go test`. When `/api/me` fails the page shows "Couldn't load your visits. Reload the page to try again." or "Couldn't record your visit. Try again." `/assets/` answers with the page.
- **The Start guide:** the button is off while its call is out, and a failed call shows "Couldn't record your visit. Try again." `HomeCard` takes `first` and `visitAgain`.
- **Admin's screen:** when the browser refuses the clipboard, the code's row shows "Couldn't copy the link. Select it and copy it yourself." No other screen changed: the hub, admin's layout and each example's card look the same. The Go card shows nothing until /api/me answers, as before, and its heading is "Your visits" only when that first call fails.
- **The install's `AGENTS.md`** has a turbo bullet under "Dev tools" on the `transit` task, and `turbo.json` changed.
- **Upgrading:** the changeset lists what an existing install copies by hand.
