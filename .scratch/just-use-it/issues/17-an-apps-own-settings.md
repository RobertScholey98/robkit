# 17: An app's own settings

**What to build:** Nothing says where an app's own settings go: an API key, a feature switch, the address of something it calls. `robkit-dev` loads no file, so today the only way is to export the value in the shell before `pnpm dev`, where every app gets it. It is one of the first questions an app's author asks.

- **One file per app.** `robkit-dev` loads `apps/<slug>/.env`, if it exists, into that app's environment and no other's. Node's own parser reads it, so there is no new dependency. That parser is lenient and reports no errors, so robkit promises none: a line it can't read is skipped, as Node skips it.
- **robkit's settings win.** A `.env` can't set what `robkit-dev` sets for the app: `ROBKIT_APP`, `ROBKIT_CORE_URL`, `ROBKIT_DOMAIN`, `DATABASE_URL`, `PORT`. A file that tries is refused with the name of the variable, so nobody wonders why their value didn't take.
- **`.env` is the one file robkit loads.** A stack that loads files of its own, as Next does with `.env.local`, still does; robkit neither loads nor blocks them.
- **Kept out of git and out of images.** The install's `.gitignore` and `.dockerignore` leave out every `.env*` file in any folder except `.env.example`. An `.env.example` beside the app is the convention for saying what it needs, and is committed.
- **Production.** The owner sets an app's own settings on the host. The install's `docs/deploy.md` says where in Coolify, and that `robkit deploy` leaves variables it didn't set alone. Check that it does.
- **Docs.** The install's `AGENTS.md` and each stack's say where settings go, in dev and in production.

The shell's environment still reaches every app, as today. An app run under `pnpm dev` has the owner's whole machine anyway, so narrowing it would add rules without adding safety. Note that in the comments.

**Blocked by:** 16

**Status:** ready-for-agent

- [ ] A variable in `apps/notes/.env` reaches the `notes` app under `pnpm dev` and no other app
- [ ] A `.env` that sets `DATABASE_URL` or `ROBKIT_APP` stops `pnpm dev` with a message that names the file and the variable
- [ ] A new install's `.gitignore` and `.dockerignore` leave out `.env` and `.env.local` in every folder and keep `.env.example`
- [ ] `robkit deploy` doesn't remove a variable the owner set on the host, with a test that shows it
- [ ] `docs/deploy.md` and the `AGENTS.md` files say where an app's settings go
- [ ] The PR's CI `gate` job passes on GitHub
