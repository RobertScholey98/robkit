# 11: `serve()` in each adapter

**What to build:** Each Node stack, the hub and admin have a `serve.ts` that starts the built app in production: it reads `HOST` and `PORT` through `@robkit/input`, serves the built files, and listens. Start's is 33 lines and loads the built server entry by hand. The lines are the same in every app on a stack, so they belong in the adapter.

- **The call.** Each Node adapter gains a `/serve` entry:
  - `@robkit/hono/serve`: `serve(app)` serves the built files, then the app.
  - `@robkit/express/serve`: `serve(app)`, the same for Express.
  - `@robkit/start/serve`: `serve()` loads the built server entry and serves the client's files before it.
  - `@robkit/next/serve`: `serve()` prepares Next from `dist` and serves it.
- **The hub.** The hub is a built page with no app behind it, so it uses `servePage()` from a new `@robkit/vite/serve` entry: it serves what `vite build` wrote, and the page for any other path. That entry imports nothing from Vite, so the hub's image holds no build tool, and nothing from the guard, which `@robkit/hono/serve` would bring. It sends `X-Frame-Options: DENY`, `frame-ancestors 'none'` and `nosniff`, as `robkit()` does for the hub in dev. Admin is a Hono app, so it uses `@robkit/hono/serve`.
- **Paths are the app's, not the package's.** Each finds the build from the folder the app runs in, which the container sets, not from where the adapter is installed. An options argument overrides the folders.
- **What every one does.** Reads `HOST` and `PORT` (`127.0.0.1` and 3000 unless set), refuses to start with the reader's message when one is malformed, prints one line when it listens, sends `nosniff` on the files it serves, and stops cleanly on SIGTERM so a container's stop doesn't cut a request off.
- **The stop has to work in the image.** The image runs `node --run start`, and `start` is `<migrate> && <serve>`, so a shell stands between Docker's signal and the server. Prove the stop with `docker stop` in the production test. Change the Dockerfile's `CMD` or the `start` scripts if that is what it takes.
- **Built files are public.** `serve` answers an app's built files, and anything in its `public` folder, before the guard. Say so in each stack's `AGENTS.md` and in `SECURITY.md`: nothing a viewer shouldn't see goes there.
- **The app keeps `serve.ts`.** It is three lines or so, so an owner can put their own code before the call.
- **Dependencies.** What `serve` needs at runtime, such as `@hono/node-server`, moves from the app's manifest to the adapter's where the app no longer imports it. After this ticket no Node stack's files import `@robkit/input`, so it leaves each stack's manifest. The production image must still hold only what the app runs on; the production test checks that.
- **Docs.** Each stack's `AGENTS.md` serving section and each adapter's README.

**Blocked by:** 10

**Status:** ready-for-agent

- [ ] Each Node stack's `serve.ts`, the hub's and admin's, is one import of a serve function, the app where there is one, and one call
- [ ] Each listens on `HOST` and `PORT`, serves the built files from the app's own folder with `nosniff`, and refuses a malformed `PORT` with the reader's message
- [ ] `docker stop` on each stack's production image ends the container before Docker's kill timeout, and a request open at the time finishes
- [ ] The hub's production image holds neither Vite nor the guard's packages, and its answers carry the three headers
- [ ] No Node stack's files import `@robkit/input`, and no stack's manifest lists it
- [ ] The production test passes for every stack, its extra-packages check included
- [ ] The API reports, READMEs and changesets cover the new entries
- [ ] The PR's CI `gate` job passes on GitHub
