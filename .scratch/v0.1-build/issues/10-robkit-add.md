# 10: `robkit add`

**What to build:** In an install, `robkit add` offers only the generators enabled in `robkit.json` and asks for the name, who can open it (anyone, roles, owner only), the UI kit opt-in when relevant, and an icon. It writes `apps/<slug>` and the app's manifest. After `pnpm dev`, the new app opens at `<slug>.robkit.localhost`, gated as chosen.

**Blocked by:** 08, 22, 23, 25

**Status:** done

**Provisioning:** `add` writes files only and creates nothing in Postgres. The provision step from ticket 23 gives every app with a `migrate` script its schema and role, then runs the script. Core registers the app with the launcher when it starts, from what the app's manifest declares. The provision step is safe to run any number of times. It runs before migrations, under `pnpm dev` locally and as a pre-deploy step in production (ticket 11), so a hosted install gets a new app on its next deploy the same way a laptop does. It is the only step that holds a Postgres admin connection.

- [x] Both stacks can be added, and each passes the guest journey
- [x] The new app's role can only touch its own schema
- [x] Running the provision step twice changes nothing the second time
- [x] The new app's migrate step runs after provisioning and before the app starts
- [x] A `robkit/templates/<stack>` folder in the install overrides that stack's template
- [x] `robkit add` with flags works without prompts

**Answered (R, 2026-11-03):**

- **Slugs are letters and digits only:** `^[a-z][a-z0-9]{0,62}$`, and not `public` or `postgres`. A slug is also a subdomain, and `my_app.<domain>` isn't a valid hostname. `slugProblem` in `@robkit/dev` holds the rule, so `pnpm dev`, the provision step and `robkit add` all refuse an underscore.
- **Production role passwords are derived from one install secret.** `ROBKIT_DB_SECRET` is held only by the provision step, and each app's password is an HMAC of its slug. robkit prints each app's `DATABASE_URL`, so the owner sets it once on the host (Coolify). Ticket 11 builds this. Local dev keeps ticket 23's fresh password on every run.

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5

## Comments

Notes carried over from the finished tickets 02 to 09, which were deleted once done:

- **Slugs.** Each slug becomes a Postgres role, so it must be a plain identifier, and a name with a hyphen can't have a database. That's why the Start example's slug is `start`, not `start-example`. (02, 07) R's 2026-11-03 answer above narrows the rule to letters and digits.
- **Mounting a stack.** A stack's Vite config reads its host from `ROBKIT_APP`, so a stack template names no slug and `add` can mount it at any slug. (08)
- **Drizzle migrations.** An app's role can't run Drizzle's stock migrator, because it starts with `CREATE SCHEMA IF NOT EXISTS`, which Postgres refuses to a role without CREATE on the database. `@robkit/core`'s `migrate` skips that statement. Every Drizzle app template needs the same. (02)
- **Platform apps.** Core's app catalog doesn't hold the hub or admin. Admin passes a fixed owner-only rule to its guard. (06)

What the build chose, awaiting R's review:

- **Where `robkit` lives.** `create-robkit` ships a second command, `robkit`, because it already holds the templates, the choice table and the generator. An install takes `create-robkit` as a dev dependency (linked to the checkout with `--link`, like the `@robkit/*` packages) and a `robkit` script, so the owner runs `pnpm robkit add`. `pnpm add` is pnpm's own command, so the script can't be called `add`.
- **The manifest.** An app's manifest is the `robkit` field of its `package.json`: `{ "access": { "kind": "open" | "owner" } | { "kind": "roles", "roles": ["Family"] }, "icon": "📝" }`. It reuses the guard's rule shape, with roles named rather than by id, since `add` can't know the ids. An app without the field, like init's example, is owner-only with no icon.
- **How the manifest reaches core.** The dev runner hands core `ROBKIT_APPS` as a JSON list of each app's slug and manifest, and core checks it with `readDeclaredApps`, refusing to start on one it can't read. Core stays the only writer of its tables: it adds a new app with the declared rule, creating any role it names that the owner lacks, and keeps the owner's rule for an app it already knows. The icon follows the manifest on every start, since admin can't edit it.
- **The icon** is one emoji, `📦` unless the owner picks another. It's a new `icon` column in core's app catalog, and the hub's launcher shows it beside the name.
- **Who can open it** offers Only me (the default), Anyone, signed in or not, and Guests with certain roles. Open lets signed-out visitors in, as the guard has always done.
- **Questions or flags.** With no flags, `add` asks for the stack (skipped when `robkit.json` offers one), the name, who can open it, the roles when gated to them, and the icon, then prints the flags that add the same app, as init does. With flags it asks nothing: `--stack` defaults to the first generator, `--access` to `owner`, `--icon` to `📦`. The name check also refuses the platform apps' names and a folder that exists, with `newSlugProblem` as the prompt's validator.
- **Installing.** In an install whose `node_modules` exists, `add` runs the package manager's install so the new app's dependencies are in. Otherwise it prints `pnpm install` as the first next step.
- **The catalog.** The generator now catalogs the dependencies of every stack `robkit.json` enables, not only the example's, so `add` never needs a version the install lacks. A template override that adds a dependency needs it added to the catalog by hand.
- **A template override replaces the stack's template whole**, rather than overlaying it file by file, the Ignite way: copy the template, then edit it.
- **The UI kit opt-in** isn't asked yet, since no kit is ready. Ticket 15 adds it.

Notes for later tickets:

- **For 11.** Core needs `ROBKIT_APPS` in production: a JSON list of `{ slug, access?, icon? }`, which `catalogOf(await discoverApps(root))` in `@robkit/dev` builds from the install. The deploy step that runs the provision step can compute it the same way. An app added after the first deploy shows in the launcher once core restarts with the new list.
- **For 12.** An added app is a copy of its stack's template plus the `robkit` field, so the per-app `AGENTS.md` and `CLAUDE.md` go in the stack templates and `add` copies them with everything else.
- **For 15.** `AppChoices` in `src/add.ts` and `askAdd` in `src/add-wizard.ts` are where the UI kit opt-in goes, asked only when `robkit.json` has a kit.
- **Tests.** `src/add.test.ts` and `src/robkit.test.ts` in `create-robkit` cover the template, the override, the slug checks, the flags and the questions. The whole-stack test adds an app on the other stack to each install with `pnpm robkit add added --stack <other> --access open --icon 🧪`, provisions and migrates it under `pnpm dev`, and a guest opens it from the launcher. The role journey now sees that open app too. The role's confinement and an idempotent provision are tested in `@robkit/dev`'s `provision.test.ts`, which every added app goes through.
