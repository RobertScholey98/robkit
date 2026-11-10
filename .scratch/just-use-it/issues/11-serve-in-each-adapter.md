# 11: `serve()` in each adapter

**What to build:** Each Node stack, the hub and admin have a `serve.ts` that starts the built app in production: it reads `HOST` and `PORT` through `@robkit/input`, serves the built files, and listens. Start's is 33 lines and loads the built server entry by hand. The lines are the same in every app on a stack, so they belong in the adapter.

- **`@robkit/serve`: what every server does, written once.** A new small published package. It reads `HOST` and `PORT` (`127.0.0.1` and 3000 unless set), refuses to start with the reader's message when one is malformed, listens, prints one line when it does, serves files from a folder with `nosniff`, and stops on SIGTERM. Four adapters would otherwise each write those lines, and they would drift as the four `migrate.ts` copies did. It depends on `@robkit/input` and on nothing from the guard, Vite or any stack. It has the published-package shape.
- **The call.** Each Node adapter gains a `/serve` entry, built on `@robkit/serve`:
  - `@robkit/hono/serve`: `serve(app)` serves the client's files, then the app.
  - `@robkit/express/serve`: `serve(app)`, the same for Express.
  - `@robkit/start/serve`: `serve()` loads the built server entry and serves the client's files before it.
  - `@robkit/next/serve`: `serve()` prepares Next from `dist` and serves it.
- **It gives back the server.** Each returns the Node server it started, or a promise of it where starting waits, as Next's does. An owner can then attach a WebSocket server, and a test can close it.
- **The hub.** The hub is a built page with no app behind it, so it calls `servePage()` from `@robkit/serve`: it serves what `vite build` wrote, and the page for any other path. Its image then holds no build tool and nothing from the guard. It sends `X-Frame-Options: DENY`, `frame-ancestors 'none'` and `nosniff`, as `robkit()` does for the hub in dev. Every container gets `ROBKIT_CORE_URL` (`packages/create-robkit/src/deployment.ts`), so when that is https `servePage()` also sends the `Strict-Transport-Security` header ticket 06 gives core and the guard. With the setting absent it sends none and still serves. Admin is a Hono app, so it uses `@robkit/hono/serve`.
- **Only the client's files are served.** A react-hono or Express build writes the server's own bundle, `dist/serve.js`, beside `dist/assets`. `serve` answers `/assets/*` from `dist/assets`, as both templates do today, and never the rest of `dist`. For Start and Next, say which folders hold the client's files and serve only those. The hub's `dist` is all the client's. A path that tries to leave the folder, encoded or not, gets no file.
- **Paths are the app's, not the package's.** Each finds the build from the folder the app runs in, which the container sets, not from where the adapter is installed. An options argument overrides the folders.
- **The stop.** Ticket 12 makes Docker's signal reach the app's own process in every image. Here `@robkit/serve` handles it: on SIGTERM it stops taking new requests, lets open ones finish, closes idle connections and exits. Prove that once, in `@robkit/serve`'s own tests, with a slow handler and a signal. No route in an install is slow enough to show it from outside, so the production test proves only that each container exits in time: the hub, admin and every stack's app, Go's included.
- **Built files are public.** `serve` answers the client's built files, and anything in the app's `public` folder, before the guard. Say so in each stack's `AGENTS.md` and in `SECURITY.md`: nothing a viewer shouldn't see goes there.
- **The app keeps `serve.ts`.** It is three lines or so, so an owner can put their own code before the call.
- **Dependencies.** What `serve` needs at runtime, such as `@hono/node-server`, moves from the app's manifest to the adapter's where the app no longer imports it. After this ticket no Node stack's files import `@robkit/input`, so it leaves each stack's manifest, and the hub's dependencies are `@robkit/serve` alone. The production image must still hold only what the app runs on. The extra-packages check counts a peer as needed, so it can't see a build tool that arrives as one. The production test also says by name that `vite` is in neither the hub's image nor the Express app's.
- **Docs.** Each stack's `AGENTS.md` serving section, each adapter's README and the new package's.

**Blocked by:** 10

**Status:** ready-for-agent

- [ ] Each Node stack's `serve.ts`, the hub's and admin's, is one import of a serve function, the app where there is one, and one call
- [ ] Each listens on `HOST` and `PORT`, serves the client's files from the app's own folder with `nosniff`, and refuses a malformed `PORT` with the reader's message
- [ ] Each adapter's `serve` returns the Node server, and a test closes it
- [ ] A request for the server's bundle, such as `/serve.js` on a react-hono or Express app, never gets the file, and neither does a path that climbs out of the served folder
- [ ] In `@robkit/serve`'s tests, a request open when SIGTERM arrives finishes, and the process then exits
- [ ] `docker stop` on the hub's, admin's and every stack's production image, Go's included, ends the container before Docker's kill timeout, and not with exit code 137
- [ ] The hub's production image holds neither Vite nor the guard's packages, and its answers carry the three headers, and `Strict-Transport-Security` on an https install
- [ ] The production test finds no `vite` package in the hub's image or the Express app's
- [ ] No Node stack's files import `@robkit/input`, and no stack's manifest lists it
- [ ] The production test passes for every stack, its extra-packages check included
- [ ] `@robkit/serve` has its README, API report, graph entry, changeset and thresholds, and the API reports, READMEs and changesets cover the adapters' new entries
- [ ] The PR's CI `gate` job passes on GitHub
