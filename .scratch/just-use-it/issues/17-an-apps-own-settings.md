# 17: An app's own settings

**What to build:** Nothing says where an app's own settings go: an API key, a feature switch, the address of something it calls. `robkit-dev` loads no file, so today the only way is to export the value in the shell before `pnpm dev`, where every app gets it. It is one of the first questions an app's author asks.

- **One file per app.** `robkit-dev` loads `apps/<slug>/.env`, if it exists, into that app's environment and no other's. Node's own parser, `util.parseEnv`, reads it, as it reads the install's root `.env` since ticket 16. So there is no new dependency, and loading a file changes nothing in the runner's own environment. That parser is lenient and reports no errors, so robkit promises none: a line it can't read is skipped, as Node skips it. The file is read when `pnpm dev` starts, so an edit takes effect at the next start. Say so in the docs.
- **Three sources, in one order.** What the runner sets for an app wins. Then the shell. Then the app's `.env`. The shell beats the file as it does in Next, in Vite and in Compose.
- **robkit's settings win, and say so.** A `.env` can't set a name that starts `ROBKIT_`, nor a name the runner sets for an app (`DATABASE_URL`, `PORT` and `HOST`), nor `NODE_ENV` or `VITEST`. Those two decide whether `guardedAs()` serves and whether `robkit()` sets the dev server up, so a file that set one would open an app or break it. A file that tries is refused with the name of the variable, so nobody wonders why their value didn't take. The refused names and what the runner sets come from one place in the code, so a setting robkit adds later is covered.
- **Telemetry is a default.** `NEXT_TELEMETRY_DISABLED` is the one name robkit sets that an owner may change. Today the runner sets it over the shell's value, and `withRobkit()` in `packages/next/src/config.ts` sets it again whatever it holds. Both set it only where nothing has, so the shell or the app's `.env` decides.
- **A setting the browser reads.** A `VITE_*` or `NEXT_PUBLIC_*` value is written into the client's files when the app is built. Under `pnpm dev`, and in a `pnpm build` on the owner's machine, Vite and Next read it from the app's `.env` themselves. An image is built without that file, and the install's `Dockerfile` takes no build variable but `ROBKIT_APP`, so in production the value is missing. The docs say so, and say what works today: read the setting on the server and hand it to the page. Whether an image should take such values is ticket 32, which waits for R.
- **The app's `migrate` script gets them too.** The provision step runs each app's `migrate` script before the app starts, and an owner's own script may read a setting.
- **`.env` is the one file robkit loads.** A stack that loads files of its own, as Next does with `.env.local`, still does; robkit neither loads nor blocks them.
- **Kept out of git and out of images.** The install's `.gitignore` and `.dockerignore` leave out every `.env*` file in any folder except `.env.example`. An `.env.example` beside the app is the convention for saying what it needs, and is committed.
- **Production.** The owner sets an app's own settings on the host. The install's `docs/deploy.md` says where in Coolify, and that `robkit deploy` leaves variables it didn't set alone. Check that it does.
- **Docs.** The install's `AGENTS.md` and each stack's say where settings go, in dev and in production.

The shell's environment still reaches every app, as today. An app run under `pnpm dev` has the owner's whole machine anyway, so narrowing it would add rules without adding safety. Note that in the comments.

**Blocked by:** 16

**Status:** done

- [x] A variable in `apps/notes/.env` reaches the `notes` app under `pnpm dev` and no other app
- [x] A `.env` that sets `DATABASE_URL`, `PORT`, `HOST`, `NODE_ENV`, `VITEST` or any `ROBKIT_` name stops `pnpm dev` with a message that names the file and the variable
- [x] A name set in the shell and in an app's `.env` reaches the app with the shell's value, and loading the file leaves the runner's own environment as it was
- [x] A variable in `apps/notes/.env` reaches that app's `migrate` script under `pnpm dev`
- [x] `NEXT_TELEMETRY_DISABLED=0` in a Next app's `.env` reaches `next dev`, and `withRobkit()` leaves it as it found it
- [x] A new install's `.gitignore` and `.dockerignore` leave out `.env` and `.env.local` in every folder and keep `.env.example`
- [x] `robkit deploy` sends the host no request that removes or replaces a variable it didn't set, with a test of the requests it sends
- [x] `docs/deploy.md` and the `AGENTS.md` files say where an app's settings go, that an edit waits for the next `pnpm dev`, and that a `VITE_*` or `NEXT_PUBLIC_*` value isn't in a production image, with what to do instead
- [x] The PR's CI `gate` job passes on GitHub

## Comments

### From milestone 2, added by the lead

Checked against the code on 2026-11-10, after milestone 2 merged.

- **What the runner sets for an app today** (`packages/dev/src/runner.ts`): `ROBKIT_DOMAIN`, `ROBKIT_CORE_URL`, `ROBKIT_APPS`, `ROBKIT_APP`, `PORT`, `NEXT_TELEMETRY_DISABLED`, and `DATABASE_URL` for an app that migrates. The ticket's list lacked `ROBKIT_APPS`. I replaced the list with the rule above, and added the `migrate` bullet and its criterion.
- **`.dockerignore` leaves out a `.env` at the root only.** The base template's says `.env` and `.env.*`, which Docker matches against the root of the build. So `apps/notes/.env` would be copied into an image today. `**/.env` and `**/.env.*` match every folder. `.gitignore` is right already: git matches a name with no slash in every folder, and it keeps `.env.example`.
- **A test runs with no `pnpm dev` behind it** (ticket 08), so nothing loads `.env` for it. A test that needs a setting sets it. Say so where each stack's `AGENTS.md` describes tests.

### From the ticket round, 2026-11-10

Opus 5.5 and Sol 6.1 read milestone 3's tickets at `a314729`. Opus had one must-change here. I checked each point against the code.

- **A setting the browser reads isn't in a production image** (Opus, must-change; Sol as a should). The base template's `Dockerfile` has `ARG ROBKIT_APP` and no other build variable an owner can set, and `.dockerignore` leaves `.env` out. The ticket promised settings "in dev and in production" and didn't say this kind is missing there. I took the half that changes nothing an owner has today: the docs say it. Whether an image should take such values changes what an owner can do, so it is ticket 32 and waits for R.
- **My line on `NEXT_TELEMETRY_DISABLED` was wrong** (Sol). I wrote that a `.env` may change it. `withRobkit()` sets it to `1` whatever it holds, and the runner sets it over the shell's value. The bullet above now makes both a default.
- **`NODE_ENV` and `VITEST` are refused too** (Opus). `guardedAs()` serves when `NODE_ENV` is `test`, or when `VITEST` is set and `NODE_ENV` isn't `production` (`packages/hono/src/testing.ts`). `robkit()` sets nothing up under `VITEST` (`packages/vite/src/robkit.ts`), and the runner deletes `VITEST` for that reason.
- **The order of the three sources is written down** (Sol), and the parser is the one that leaves the runner's environment alone (Sol).
- **The deploy criterion says what its test can show** (Opus): the requests robkit sends, not what the host does with them.

### From the build, 2026-11-10

Built on branch `93-an-apps-own-settings`.

**How it works** (`packages/dev/src/app-env.ts`).

- `appSettings(install, app, databaseUrl)` is the one list of what the runner decides for an app. `VITEST`, `ROBKIT_DATABASE_URL` and, for an app without a database, `DATABASE_URL` are keys with no value, which the runner removes. So `shellForApps` is gone, and the refused names come from this list's keys.
- `ownSettings(install, apps)` reads each `apps/<slug>/.env` with `util.parseEnv` and refuses a name that is a key of `appSettings`, starts `ROBKIT_`, or is `NODE_ENV`. It reads every file before refusing, so each refused name prints as its own line.
- `appEnv(install, shell, app, { own, databaseUrl })` builds an app's environment: `appSettings` wins, then the shell, then the file, then the one default, `NEXT_TELEMETRY_DISABLED=1`. The runner calls it, through `envFor`, for each app it starts and each `migrate` script it runs.

**Chosen in the build:**

- **A `migrate` script gets its app's whole environment**, `ROBKIT_APP` and `PORT` included, not only the shared settings. That is one function for both, and it is what the `start` script in an image already runs with.
- **`provisionApps` takes the apps the runner found** rather than the install's folder. It found them again with default ports, so a `migrate` script would have seen the wrong `PORT`.
- **The files are read before the Go and Docker checks**, right after the apps are found, so a refused file stops `pnpm dev` before anything else is asked.
- **`DATABASE_URL` is refused for every app**, one with no `migrate` script too. The runner removes the shell's for such an app today, so a file's would have been a second way in.
- **Three messages**, each naming the file and the variable: a name the runner decides ("which pnpm dev decides for each app"), any other `ROBKIT_` name (points at the install's root `.env`), and `NODE_ENV` (names `guardedAs()`). Each ends "Remove it from the file."
- **`.env.example` stays in an image.** `.dockerignore` has `**/.env`, `**/.env.*` and `!**/.env.example`. The production test writes `.env`, `.env.local` and `.env.example` into the example and checks its image holds only `.env.example`.
- **`docs/deploy.md` says to redeploy from Coolify after changing a variable**, since `robkit deploy` deploys only the apps whose code changed.

**What `robkit deploy` sends for variables.** One `PATCH /applications/<uuid>/envs/bulk` per app, naming only the variables in deploy.md's table (and core's own). It sends no `DELETE`, and its `PATCH /applications/<uuid>` carries settings only. Coolify v4's bulk route adds or updates each variable it names and leaves the rest, as the fake models it. So an owner's own variable survives, unless it has one of robkit's names. The test shows the requests, not what Coolify does with them. `coolify-deploy.test.ts` now checks the requests: no `DELETE`, no other name in a bulk body, and the owner's variable still there in the fake. Nothing in the deploy changed.

**Why the shell still reaches every app.** An app under `pnpm dev` runs as the owner, with the owner's files and network. Narrowing the shell's environment would add a rule for every app's author to learn and stop nothing the app can't already reach. The refusals protect robkit's own settings, which is a different job.

**Not proved against a real `next dev`.** The runner test shows `NEXT_TELEMETRY_DISABLED=0` from an app's `.env` reaching the app's process, and `withRobkit()`'s test shows it leaves a set value alone. No test starts `next dev` with the file.

**For 18:** an added app gets its settings the same way as at start. Call `ownSettings(facts, [app])`, which refuses as at start, then `provisionApps([app], { adminUrl, envFor })`, then start it with `envFor(app, databaseUrl)`. `envFor` in `runner.ts` closes over `own`, the map `ownSettings` returned, so add the new app's entry to it. The refused names don't depend on `facts`' values, but the environment does: an added app changes `ROBKIT_APPS`.

### Merged

Added by the lead. PR 93 merged into `m3-making-an-install` on 2026-11-10 as `507d512`, with `gate`, `check`, `pull-request` and `production` green on `03b4c5b`, on the first CI run.

The worker's full gate never passed on the lead's machine: three gates ran side by side and two runs failed on time limits alone, and the production test lost one container to the machine running out of memory. Each test passed alone, and CI passed all of them.

### From the code round, 2026-11-10

Milestone 3's code had its one council round at `8bca5524`. Opus 5.5 gave it 7 out of 10 and Sol 6.1 gave 7, and neither would merge it as it stood. I checked each finding against the code before I acted on it. These are the ones about this ticket.

Not taken:

- **Pass only the four documented dev settings from the root `.env` to an app** (Opus, should-change). `withInstallEnv` gives every `ROBKIT_` name in the install's root `.env` to every app. Opus said it isn't a leak today, and asked for the limit so it can't become one. Under `pnpm dev` an app runs as the owner, with the owner's files, so it can read the root `.env` itself. "Why the shell still reaches every app" above gives the same reason for the shell's environment. A limit would stop nothing the app can't already reach.
