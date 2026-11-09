# 11: `serve()` in each adapter

**What to build:** Each Node stack, the hub and admin have a `serve.ts` that starts the built app in production: it reads `HOST` and `PORT` through `@robkit/input`, serves the built files, and listens. Start's is 33 lines and loads the built server entry by hand. The lines are the same in every app on a stack, so they belong in the adapter.

- **The call.** Each Node adapter gains a `/serve` entry:
  - `@robkit/hono/serve`: `serve(app)` serves the built files, then the app.
  - `@robkit/express/serve`: `serve(app)`, the same for Express.
  - `@robkit/start/serve`: `serve()` loads the built server entry and serves the client's files before it.
  - `@robkit/next/serve`: `serve()` prepares Next from `dist` and serves it.
- **Paths are the app's, not the package's.** Each finds the build from the folder the app runs in, which the container sets, not from where the adapter is installed. An options argument overrides the folders.
- **What every one does.** Reads `HOST` and `PORT` (`127.0.0.1` and 3000 unless set), refuses to start with the reader's message when one is malformed, prints one line when it listens, and stops cleanly on SIGTERM so a container's stop doesn't cut a request off.
- **The hub and admin.** Admin is a Hono app, so it uses `@robkit/hono/serve`. The hub is a built page with no app behind it. Give it a one-call serve too, from whichever package fits best, and say why. It sends the hub's headers from ticket 06, so the hub's `serve.ts` doesn't set them by hand.
- **The app keeps `serve.ts`.** It is three lines or so, so an owner can put their own code before the call.
- **Dependencies.** What `serve` needs at runtime, such as `@hono/node-server`, moves from the app's manifest to the adapter's where the app no longer imports it. After this ticket no Node stack's files import `@robkit/input`, so it leaves each stack's manifest. The production image must still hold only what the app runs on; the production test checks that.
- **Docs.** Each stack's `AGENTS.md` serving section and each adapter's README.

**Blocked by:** 10

**Status:** ready-for-agent

- [ ] Each Node stack's `serve.ts`, the hub's and admin's, is one import of a `serve`, the app where there is one, and one call
- [ ] Each `serve` listens on `HOST` and `PORT`, serves the built files from the app's own folder, and refuses a malformed `PORT` with the reader's message
- [ ] A SIGTERM during a request lets the request finish before the process exits
- [ ] No Node stack's files import `@robkit/input`, and no stack's manifest lists it
- [ ] The production test passes for every stack, its extra-packages check included
- [ ] The API reports, READMEs and changesets cover the new entries
- [ ] The PR's CI `gate` job passes on GitHub
