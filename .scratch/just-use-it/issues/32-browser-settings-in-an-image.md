# 32: A setting the browser reads, in production

**What to build:** An app's author who writes `VITE_API_URL=...` or `NEXT_PUBLIC_API_URL=...` in the app's `.env` sees it work under `pnpm dev`, and finds it missing once deployed. Vite and Next write such a value into the client's files when the app is built. An image is built without the app's `.env`, and the install's `Dockerfile` takes no build variable but `ROBKIT_APP`. Ticket 17 makes the docs say so. This ticket is whether robkit should do more.

**Blocked by:** 17

**Status:** needs-info

**Open:**

- Should an owner be able to give an app's image a value the browser reads?

  Recommended: not in this work. Ticket 17's docs say the value is missing in production and what works today, which is to read the setting on the server and hand it to the page. Every stack robkit ships has a server, so nothing is out of reach. The two ways to do more each have a cost:

  1. **A committed `apps/<slug>/.env.production`.** Vite and Next both read it at build with no code from robkit. It needs the two ignore files to let that one name through. The cost is a file named `.env` that is committed and copied into an image, beside one that must never be. An owner who puts a secret in the wrong one has published it.
  2. **Build variables through the `Dockerfile`.** The owner sets them on the host, as with every other setting. The `Dockerfile` can only take variables it names, so robkit would have to write each app's names into it, and `robkit deploy` would have to send them to Coolify as build variables.

  If R wants one, I would build the first, with a check that refuses a name in `.env.production` that doesn't start `VITE_` or `NEXT_PUBLIC_`.

**If yes, the criteria would be:**

- [ ] A `VITE_*` value reaches the built client of a Vite stack's image, and a `NEXT_PUBLIC_*` value the Next stack's, with the production test showing each
- [ ] The file takes only names that start `VITE_` on a Vite stack or `NEXT_PUBLIC_` on Next, and the build refuses any other name. The app's `.env` still never reaches an image
- [ ] The docs say every value in that file is public, since a prefix can't tell whether a value is a secret
- [ ] `docs/deploy.md` and each stack's `AGENTS.md` say where such a value goes

## Comments

Raised in milestone 3's ticket round (2026-11-10) by Opus 5.5, as a must-change on ticket 17, and by Sol 6.1 as a should. Ticket 17 took the docs. This is the rest.

### From milestone 4's ticket round, 2026-11-11

Both reviewers agree with the recommendation: not in this work. Sol found the criterion "no server secret can reach an image the same way" can't be proved from a name: a secret called `VITE_SECRET` would pass. The criteria now say which names the file takes, and that the docs call every value in it public.
