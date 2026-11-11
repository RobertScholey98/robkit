# 21: Reference: every setting

**What to build:** One page listing every setting an owner or a builder meets. For each: its name, what it does, who sets it, where, and its default in dev and in production, or that it has none.

- **Three kinds.** Settings an owner sets (the install's dev settings in the root `.env`, core's in production, and what `robkit deploy` reads, such as `COOLIFY_URL`). Settings robkit sets for an app, which the app reads and doesn't choose (`DATABASE_URL`, `PORT`, `ROBKIT_APP`). And the names an app's `.env` can't set, with the rule: the runner's own names, any name that starts `ROBKIT_`, and `NODE_ENV`.
- **Held to the code.** A test scans the source of the published packages and the Go module for names that start `ROBKIT_`, leaving out tests and test helpers, and fails where the page and the scan differ. Names without that prefix, such as `DATABASE_URL`, `HOST`, `PORT`, `COOLIFY_TOKEN` and the two Cloudflare Access names, are held by a list in the test, each with the file that reads it.
- **The refused names** come from the dev runner, which doesn't export them. Export them from `@robkit/dev`, in a commit of its own with a changeset, and build that part of the table from the export.

Milestone 4 makes `ROBKIT_APPS` required by core (ticket 24 of "Just use it") and changes what `robkit deploy` sets (ticket 22).

**Blocked by:** 03, 05

**Status:** done

- [x] Every `ROBKIT_` name the published packages and the Go module read is on the page, and none is on the page that the code doesn't read
- [x] The names without the prefix that the test lists are on the page, each with who sets it and where
- [x] Each setting says its default in dev and in production, or that it must be set
- [x] The refused names on the page are the dev runner's, built from its export, which has a changeset and is in the API report
- [x] The page says where each kind of setting goes and what wins over what
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

**What I chose**

- The page has one section for each kind of setting, plus "Where each setting goes", which says where each kind goes and what wins:
  - what you set for `pnpm dev`, for production and for `robkit deploy`
  - what robkit sets for each app
  - the names an app's `.env` can't set
- Each setting is an `###` heading with its name, a sentence on what it does, and three items: **Who sets it.**, **In dev.** and **In production.** A setting nothing reads in one of the two says so. One that has no default says it must be set.
- `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` share a heading. The host's `<SLUG>_DATABASE_URL` shared variables have one heading, since their names come from the slugs.
- `NODE_ENV` and `VITEST` appear only among the refused names, and `NEXT_TELEMETRY_DISABLED` only in "what wins", since no owner or builder sets them for robkit.
- `@robkit/dev` exports `refusedAppSettings`:
  - `decidedForEachApp`, the names `pnpm dev` sets or removes for each app
  - `prefix`, `ROBKIT_`
  - `alsoRefused`, `["NODE_ENV"]`
  
  `appSettings`'s keys are typed by `decidedForEachApp`, so a name the runner sets is always refused. `ownSettings` no longer takes the install's facts, which it only passed to `whyRefused`. That is a commit of its own. The export, its changeset (minor) and the API report are another.
- `RefusedSettings.astro` lists the refused names from the export as the site builds. The site now depends on `@robkit/dev`, and `tooling/eslint/package-graph.js` allows it.

**Proof**

- `site/src/reference-settings.test.ts` (4 tests):
  - It scans `packages/*/src` and `go/` for `ROBKIT_` names. It leaves out `*.test.*`, `*_test.go`, every `test/` folder, and Go's `internal/fakecore` and `internal/conformance`, which only tests use. The page's `ROBKIT_` headings must equal the 11 names it finds. It checks that the scan finds Go's `ROBKIT_APP`, and not `ROBKIT_TEST_TAG` from a test helper.
  - It holds the other names to a list, each with a file that reads it: `DATABASE_URL`, `HOST` and `PORT` in `packages/input/src/env.ts`, `COOLIFY_URL`, `COOLIFY_TOKEN` and both `CF_ACCESS_` names in `packages/create-robkit/src/env.ts`, and `<SLUG>_DATABASE_URL` in `packages/create-robkit/src/deployment.ts`.
  - Each setting's section has the three items, in order.
  - The refused list on the page equals the export.
- I renamed `ROBKIT_DATABASES` and `COOLIFY_TOKEN` on the page and took one **In production.** label out, then rebuilt. The first three tests failed, and passed once I put the page back.
- `packages/dev/src/app-env.test.ts` checks the export's value, and that `ownSettings` refuses each name in it, plus a new `ROBKIT_` name.
- The defaults come from the code:
  - `readDevConfig` in `packages/dev/src/env.ts` gives 3000, 54320 and Compose's URL. `defaultDomain` in `packages/input/src/addresses.ts` gives `robkit.localhost`.
  - `appSettings` sets `HOST` to `127.0.0.1`. The install's `Dockerfile` sets `HOST=0.0.0.0` and `PORT=3000`.
  - `deploymentOf` in `packages/create-robkit/src/deployment.ts` is what `robkit deploy` sets on each app.
  - `requireSharedVariables` in `packages/create-robkit/src/coolify-host.ts` refuses a deploy while the host lacks a shared variable. `provision` in `packages/core/src/robkit-core.ts` skips the provision step with neither of its settings, and stops with one.
  - `readCoreConfig` makes core refuse to start without `DATABASE_URL`, `ROBKIT_CORE_URL`, `ROBKIT_APPS` or `PORT`.
- A browser test runs axe on the page at both widths in both themes, and checks it doesn't scroll sideways on a phone.
- `turbo.json` now takes `packages/*/src/**` and `go/**` as inputs of the site's build, test and test:unit. They replace `packages/create-robkit/src/**`, which `packages/*/src/**` covers.
- In `site/`, `pnpm build`, `pnpm lint`, `pnpm typecheck` and `pnpm test` (329 tests) pass. In `tooling/repo-checks`, the glossary, graph, new-package and API report tests pass. Its gofmt tests fail on this Windows machine, which has no Go. CI runs them.

**What the next tickets need**

- `refusedAppSettings` is part of `@robkit/dev`'s public API now, so a change to it needs a changeset.
- A test that reads source across the repo needs its folders among the site's turbo inputs. `turbo-inputs.test.ts` only checks `readRepoFile` calls.

**What milestone 4 and ticket 26 change**

- Core already refuses to start without `ROBKIT_APPS`, and the page says so. If just-use-it ticket 24 changes what core does with an empty list, update its section.
- When just-use-it ticket 22 changes what `robkit deploy` sets, `reference-settings.test.ts` fails on any `ROBKIT_` name it adds or drops. A value that changes without a name, such as the production `PORT`, needs a reread of `deploymentOf`.
