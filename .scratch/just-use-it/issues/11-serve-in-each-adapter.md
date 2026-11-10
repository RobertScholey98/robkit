# 11: `serve()` in each adapter

**What to build:** Each Node stack, the hub and admin have a `serve.ts` that starts the built app in production: it reads `HOST` and `PORT` through `@robkit/input`, serves the built files, and listens. Start's is 33 lines and loads the built server entry by hand. The lines are the same in every app on a stack, so they belong in the adapter.

- **`@robkit/serve`: what every server does, written once.** A new small published package. It reads `HOST` and `PORT` (`127.0.0.1` and 3000 unless set), refuses to start with the reader's message when one is malformed, listens, prints one line when it does, serves files from a folder with `nosniff`, and stops on SIGTERM. Four adapters would otherwise each write those lines, and they would drift as the four `migrate.ts` copies did. It depends on `@robkit/input` and on nothing from the guard, Vite or any stack. It has the published-package shape.
- **Serving files.** With no stack behind it the package has neither `express.static` nor Hono's `serveStatic`. Use a small maintained library for it and don't write one by hand, unless you find a reason; say which and why. A file goes out with its content type, since `nosniff` makes a browser refuse a stylesheet or script without the right one, and a browser that already holds a file can still ask whether it changed, as it can on Express today.
- **Core serves through it too.** Ticket 12 wrote core's listen and its stop before this package existed. `robkit-core serve` moves onto `@robkit/serve`, so that code has one copy. Core's own SIGTERM test from ticket 12 stays and still passes.
- **The call.** Each Node adapter gains a `/serve` entry, built on `@robkit/serve`:
  - `@robkit/hono/serve`: `serve(app)` serves the client's files, then the app.
  - `@robkit/express/serve`: `serve(app)`, the same for Express.
  - `@robkit/start/serve`: `serve()` loads the built server entry and serves the client's files before it.
  - `@robkit/next/serve`: `serve()` prepares Next from `dist` and serves it.
- **It gives back the server.** Each returns the Node server it started, or a promise of it where starting waits, as Next's does. An owner can then attach a WebSocket server, and a test can close it.
- **The hub.** The hub is a built page with no app behind it, so it calls `servePage()` from `@robkit/serve`: it serves what `vite build` wrote, and the page for any other path. Its image then holds no build tool and nothing from the guard. It sends `X-Frame-Options: DENY`, `frame-ancestors 'none'` and `nosniff`, as `robkit()` does for the hub in dev. Every container gets `ROBKIT_CORE_URL` (`packages/create-robkit/src/deployment.ts`), so when that is https `servePage()` also sends the `Strict-Transport-Security` header ticket 06 gives core and the guard. With the setting absent it sends none and still serves. Admin is a Hono app, so it uses `@robkit/hono/serve`.
- **Only the client's files are served.** A react-hono or Express build writes the server's own bundle, `dist/serve.js`, beside `dist/assets`. `serve` answers `/assets/*` from `dist/assets`, as both templates do today, and never the rest of `dist`. Admin's client build is in `dist/client`, so admin passes that folder, and `/assets/*` comes from `dist/client/assets`. The manifest beside it, `dist/client/.vite/manifest.json`, is never served. For Start and Next, say which folders hold the client's files and serve only those. The hub's `dist` is all the client's. A path that tries to leave the folder, encoded or not, gets no file.
- **The `public` folder.** No template has one today, but Vite's dev server answers a file in an app's `public` folder at the root, before the guard, so an owner who adds a favicon sees it in dev and loses it in production. For react-hono, Express and admin, `serve` answers the files in the app's own `public` folder, from where the owner keeps them. It doesn't serve the copy `vite build` may leave in `dist`, which sits beside the server's bundle. Start and Next serve `public` as their own builds lay it out.
- **Paths are the app's, not the package's.** Each finds the build from the folder the app runs in, which the container sets, not from where the adapter is installed. An options argument overrides the folders.
- **The stop.** Ticket 12 makes Docker's signal reach the app's own process in every image. Here `@robkit/serve` handles it: on SIGTERM it stops taking new requests, lets open ones finish, closes idle connections, prints one line when it has stopped, and exits with code 0. Prove that once, in `@robkit/serve`'s own tests, with a slow handler and a signal. No route in an install is slow enough to show it from outside. The production test proves that the signal reached each server: the hub's, admin's and every Node stack's container exits with code 0, and its log holds that line. A container that an init killed, or that a wrapper took down, shows neither.
- **Built files are public.** `serve` answers the client's built files, and anything in the app's `public` folder, before the guard. Say so in each stack's `AGENTS.md` and in `SECURITY.md`: nothing a viewer shouldn't see goes there.
- **The app keeps `serve.ts`.** It is three lines or so, so an owner can put their own code before the call.
- **Dependencies.** What `serve` needs at runtime, such as `@hono/node-server`, moves from the app's manifest to the adapter's where the app no longer imports it. After this ticket no Node stack's files import `@robkit/input`, so it leaves each stack's manifest. The hub's `dependencies` are `@robkit/serve` alone. Its page still imports `@robkit/input/addresses`, which Vite bundles, so `@robkit/input` moves to the hub's `devDependencies`. The production image must still hold only what the app runs on. The extra-packages check counts a peer as needed, so it can't see a build tool that arrives as one. The production test also says by name that `vite` is in neither the hub's image nor the Express app's.
- **Docs.** Each stack's `AGENTS.md` serving section, each adapter's README and the new package's.

**Blocked by:** 10

**Status:** ready-for-agent

- [ ] Each Node stack's `serve.ts`, the hub's and admin's, is one import of a serve function, the app where there is one, and one call
- [ ] Each listens on `HOST` and `PORT`, serves the client's files from the app's own folder with `nosniff`, and refuses a malformed `PORT` with the reader's message
- [ ] Each adapter's `serve` returns the Node server, and a test closes it
- [ ] A request for the server's bundle, such as `/serve.js` on a react-hono or Express app, never gets the file, and neither does admin's Vite manifest or a path that climbs out of the served folder
- [ ] In production, a file in a react-hono or Express app's `public` folder is answered at the root, as it is under `pnpm dev`
- [ ] A stylesheet and a script each arrive with their content type, and a conditional request for an unchanged file gets a 304
- [ ] In `@robkit/serve`'s tests, a request open when SIGTERM arrives finishes, and the process then prints its line and exits with code 0
- [ ] In `@robkit/serve`'s tests, a keep-alive connection that is busy when SIGTERM arrives closes with its answer, and a connection that has sent nothing doesn't hold the process past the stop's limit: it still exits with code 0 (the lead's comment below has the measurements)
- [ ] `robkit-core serve` listens and stops through `@robkit/serve`, and core's SIGTERM test from ticket 12 passes
- [ ] `docker stop` on the hub's, admin's and every Node stack's production image ends the container with exit code 0 before Docker's kill timeout, and its log holds the line the server prints when it has stopped
- [ ] The hub's production image holds neither Vite nor the guard's packages, and its answers carry the three headers, and `Strict-Transport-Security` on an https install
- [ ] The production test finds no `vite` package in the hub's image or the Express app's
- [ ] No Node stack's files import `@robkit/input`, and no stack's manifest lists it
- [ ] The production test passes for every stack, its extra-packages check included
- [ ] `@robkit/serve` has its README, API report, graph entry, changeset and thresholds, and the API reports, READMEs and changesets cover the adapters' new entries
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### From milestone 1, added by the lead

`servePage()` takes the hub's headers, HSTS included, from `@robkit/input/headers`, where ticket 10 moved what ticket 06 wrote in `@robkit/session`. `securityHeaders(origin, "none")` gives them. Don't write the values again. When this ticket lands, take the hub out of `SECURITY.md`'s "What isn't covered" under framing.

### From ticket 12's build, added by the lead

Node's `server.close()` doesn't do all that "The stop" asks. I measured it on Node 24 with a plain `http` server:

- **A connection busy when `close()` runs stays open as keep-alive.** Node goes on answering new requests on it, and the server never finishes closing while the client keeps it. A proxy with requests to send could hold a server open until Docker kills it. Core's `listenUntilStopped` (`packages/core/src/listen.ts`) now answers with `Connection: close` while it is stopping, and Node then closes the connection with that answer. Its test holds a keep-alive connection open through the signal. Keep both when the code moves to `@robkit/serve`.
- **A connection that has sent nothing holds the server open too.** `closeIdleConnections()` doesn't count it as idle, and `close()` stops the timer that would have timed it out. Nothing in core answers this yet.
- **An answer whose headers went out before the signal can't be marked.** Its connection closes when Node's keep-alive timeout runs out, 5 seconds after the answer ends.

So give the stop a limit, shorter than Docker's 10 seconds. When it runs out, close every connection that is left with `closeAllConnections()`, then stop as usual. Say in the line the server prints, or in a second line, when it had to do that. Add a test that holds a silent connection open through the signal and expects the process to exit with code 0 inside the limit.
