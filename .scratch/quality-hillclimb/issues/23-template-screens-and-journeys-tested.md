# 23: The template screens and each journey tested on their own

**What to build:** The admin and hub screens have component tests, and each whole-stack journey can run on its own. Two oversized e2e files are split along their journeys.

Today:
- The access-code and role forms in admin, and the hub's launcher, are tested only through the whole-stack test.
- `tooling/e2e/src/install-journeys.ts` runs its journeys in one sequence, where later ones depend on earlier ones.
- `install-journeys.ts` and `production-stack.ts` are each about 500 lines.

Raises rubric categories 8 (testing) and 5 (simplicity). Evidence: `../research/council-r3-opus.md` sections 5 and 8; `../research/council-r3-sol.md` section 8; `../research/council-r3-sonnet.md` section 5.

- **Component tests** for the admin and hub screens, in `templates/base/apps/admin/src/client/` and `templates/base/apps/hub/src/`. Use Testing Library against a fake `callCore`, covering the access-code and role forms' success and error states and the launcher. They run in the fast gate through the install check.
- **Independent journeys.** Each journey in `install-journeys.ts` sets up the claimed install it needs, so `vitest -t "<journey>"` runs any one alone. Show it by running two journeys alone.
- **Smaller files.** Split `production-stack.ts` into the stack's lifecycle (build, start, stop) and its assertions, and `install-journeys.ts` into one file per journey, each under about 250 lines. Pin behaviour first: the e2e test passes before and after.
- Run the e2e test in WSL only if no other ticket is running it. CI runs it on your PR.

**Blocked by:** 21

**Status:** done

- [x] Admin's forms and the hub's launcher have component tests in the fast gate
- [x] Any one journey runs alone
- [x] No e2e source file is over about 250 lines
- [x] The PR's CI `gate` job passes on GitHub

## Comments

### What I chose, and why

- **The fake is core, not `callCore`.** The tests stub `fetch` with `fakeCore` from `@internal/core-client/fake-core`, which the template already has. The real `callCore` runs, with its `{ outcome: "ok" | "failed" }` results, so a test can't pass against a `callCore` that behaves differently from the real one. The admin tests hold codes and roles in a fake core that changes them as core would, and render the whole `Admin` screen. The hub tests render `App` signed in, so the launcher is reached the way a viewer reaches it.
- **Testing Library and happy-dom.** The catalog gains `@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2, `@testing-library/user-event` 14.6.8 and `happy-dom` 21.0.4, all devDependencies of the template's admin and hub. happy-dom over jsdom: it's lighter, and jsdom's latest was a day old, which pnpm 11 refuses. No jest-dom: the assertions read `textContent` and roles.
- **happy-dom only where a test draws a screen.** Each `.tsx` test file starts with `// @vitest-environment happy-dom`, so the existing API tests stay in Node. The hub gets a `vitest.config.ts` that opens test pages on `https://hub.robkit.test/`, since the hub finds core from its own address. It also stops Vitest loading `vite.config.ts` for tests, as admin's already does.
- **What the component tests cover.** Admin: minting a code (listed with its intro link, form cleared), core refusing one (sentence shown, typing kept), core unreachable on load, creating a role with ticked guests, core refusing a role, changing a role's guests, and core refusing that (picker stays open). Hub: the launcher's links on each app's subdomain, its empty states for owner and guest, core failing to list apps, an app dropping off when the tab comes back into view, signing out, and a failed sign-out. Breaking each behaviour in a scratch install failed its test (5 of 7 admin tests for the forms' error and role changes, 5 of 7 launcher tests).
- **Independent journeys.** `dev-stack.ts` gives each suite `up()`, which waits until core, the hub, admin and both apps answer, and `claimed()`, which waits for `up()` and claims the install as the owner unless something already has. Both run once per suite. Every journey starts with `claimed()`. The claim test still claims the install itself, so it stays before the journeys; Ctrl-C's test calls `up()` and stays last.
- **Splitting the files.** The e2e journeys' tests moved into the files that hold their browser steps (`testOwnerJourney(dev)` in `owner-journey.ts`, and so on). `install-journeys.ts` keeps the stack's own four tests and the order. Starting and stopping `pnpm dev` is `dev-stack.ts`; the redirect matchers are `bounces.ts`. `production-stack.ts` became three files, not two, so each stays under 250 lines: the host (network, Postgres, Caddy) in `production-stack.ts`, building and starting apps in `production-apps.ts`, and what the test asks of the stack in `production-checks.ts`. The largest e2e file is now `dev-stack.ts` at 247 lines.

### Proof

- Pinned first: the whole-stack test on the base (1ac6c67) in WSL, 36 passed, 1 skipped (server functions on the react-hono install).
- After: the same suite on this branch in WSL, 36 passed, 1 skipped.
- Two journeys alone, in WSL: `vitest run src/start.test.ts -t "signs guests in with codes"` passed (1 passed, 10 skipped), and `vitest run src/react-hono.test.ts -t "draws the hub from the theme"` passed (1 passed, 10 skipped).
- Red on the base: the theme journey alone fails there with `page.goto: net::ERR_CONNECTION_REFUSED`, because nothing waited for the stack.
- `pnpm check` on Windows: 48 of 48 tasks pass, including `install-checks.test.ts`, which runs the new admin and hub tests in a fresh install.
- CI on PR #68: `gate`, `check` and `pull-request` passed on a17ec8b, https://github.com/RobertScholey98/robkit/actions/runs/42197912709.

### The production test fails on CI, and not because of this ticket

The PR's `production` label ran it on a17ec8b (https://github.com/RobertScholey98/robkit/actions/runs/42197913312). It stopped before any journey: the hub's container answered 502 with `ERR_MODULE_NOT_FOUND: Cannot find package '@robkit/input' imported from /install/apps/hub/serve.ts`.

- On the base, `apps/hub/serve.ts` and `apps/admin/src/serve.ts` both import `orExit` and `readServeEnv` from `@robkit/input`. Both apps list `@robkit/input` only under `devDependencies`, and the production image installs production dependencies alone. Admin would fail the same way once the hub stops failing first.
- The import came in with dafd8a1 ("End an install's servers on a config problem with orExit", round 3, ticket 16). The production test hasn't run since: pull requests skip it unless labelled, and `main`'s last run (2026-11-04) passed, before round 3 merged.
- This branch's only change to either manifest adds the four Testing Library and happy-dom devDependencies.
- I couldn't run it on `65-round-4` itself. The workflow runs only on `main`, nightly, or a labelled pull request, and labelling the round's own pull request isn't mine to do.
- The fix, for whichever ticket R gives it: move `@robkit/input` from `devDependencies` to `dependencies` in the template's `apps/hub/package.json` and `apps/admin/package.json`, then run the production test with the label.

### Not verified

- **The production test didn't run locally.** Docker Desktop restarted at 09:28 today with its WSL integration off (`wslIntegration.distros: []`), so WSL had no Docker socket or CLI. I bridged both by hand for this session, without changing Docker's settings: a bind mount of Docker's socket into `/mnt/wsl`, a Python relay to `/var/run/docker.sock`, and a loop mount of Docker's CLI ISO. That ran the whole-stack test, but not the production test: Docker's integration also makes WSL paths bind-mountable, and Caddy's Caddyfile mount failed without it. CI ran it through the PR's `production` label, and it fails on the base's problem above before reaching the split code. R may want to turn WSL integration back on in Docker Desktop's settings.
- No component test covers the hub's sign-in and setup forms, or `App`'s "Can't reach core" screen off `hub.<domain>`. The whole-stack test covers the forms.

### For other tickets

- **Ticket 22:** the template digest snapshot in `generate.test.ts` gained `apps/admin/src/client/Admin.test.tsx`, `apps/hub/src/launcher.test.tsx` and `apps/hub/vitest.config.ts`, and new hashes for both apps' `package.json` and the install's `pnpm-workspace.yaml`.
- **Ticket 25 (docs):**
  - `docs/testing.md`, "The whole-stack test": add that `pnpm --filter @internal/e2e exec vitest run src/start.test.ts -t "<journey>"` runs one journey alone, since each journey claims the install it needs, and that each journey's test sits in its `*-journey.ts` file beside its browser steps. Its line on `install-checks.test.ts` can say the hub's and admin's tests include component tests of their screens.
  - The template's `AGENTS.md`, "Dev tools", Vitest bullet: a test that draws a screen is `<name>.test.tsx`, starts with `// @vitest-environment happy-dom`, and draws it with Testing Library, with `fakeCore` answering for core.
  - `packages/create-robkit/README.md`, "how to change a template": a change to admin's or the hub's screens has component tests beside it (`Admin.test.tsx`, `launcher.test.tsx`).
