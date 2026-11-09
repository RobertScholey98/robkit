# 10: `serve()` in each adapter

**What to build:** Each Node stack has a `serve.ts` that starts the built app in production: it reads `HOST` and `PORT` through `@robkit/input`, serves the built files, and listens. Start's is 33 lines and loads the built server entry by hand. The lines are the same in every app on a stack, so they belong in the adapter.

- **The call.** Each Node adapter gains a `/serve` entry:
  - `@robkit/hono/serve`: `serve(app)` serves `dist/assets`, then the app.
  - `@robkit/express/serve`: `serve(app)`, the same for Express.
  - `@robkit/start/serve`: `serve()` loads the built server entry from `dist/server` and serves `dist/client` before it.
  - `@robkit/next/serve`: `serve()` prepares Next from `dist` and serves it.
- **What every one does.** Reads `HOST` and `PORT` (`127.0.0.1` and 3000 unless set), refuses to start with the reader's message when one is malformed, prints one line when it listens, and stops cleanly on SIGTERM so a container's stop doesn't cut a request off.
- **The app keeps `serve.ts`.** It is three lines or so, so an owner can put their own code before the call. Folders and the port can be overridden through an options argument.
- **Dependencies.** What `serve` needs at runtime, such as `@hono/node-server`, moves from the app's manifest to the adapter's where the app no longer imports it. The production image must still hold only what the app runs on; the production test checks that.
- **Docs.** Each stack's `AGENTS.md` serving section and each adapter's README.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] Each Node stack's `serve.ts` is one import of its adapter's `serve`, the app where the stack has one, and one call
- [ ] Each `serve` listens on `HOST` and `PORT`, serves the built files, and refuses a malformed `PORT` with the reader's message
- [ ] A SIGTERM during a request lets the request finish before the process exits
- [ ] No Node stack's files import `@robkit/input`
- [ ] The production test passes for every stack, its extra-packages check included
- [ ] The API reports, READMEs and changesets cover the four new entries
- [ ] The PR's CI `gate` job passes on GitHub
