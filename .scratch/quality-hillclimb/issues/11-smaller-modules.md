# 11: Smaller modules, each about one thing

**What to build:** The three largest hand-written modules split along the seams their code already has, and the generator loses machinery it no longer needs, so a reader holds less at once. Behaviour doesn't change, and the tests that call these modules through their public interfaces don't change either.

The round-1 reviewers found: `packages/core/src/app.ts` holds every route group in one `createApp`; `packages/create-robkit/src/coolify.ts` (about 575 lines) mixes config reading, the HTTP client, resource lookup, environment sync and deploy polling; `packages/create-robkit/src/generate.ts` still has a general layered deep-merge (`readLayer`, `deepMerge`, `mergeManifests`) for one overlay, though the glossary says templates are no longer layered; and core's `accessOf` loads every app and rule to answer for one slug.

Raises rubric categories 5 (simplicity) and 4 (naming). Evidence: `../research/council-r1-opus.md` section 5, `../research/council-r1-sol.md` sections 4 and 5, `../research/council-r1-sonnet.md` section 5.

- Pin behaviour first: if any of these modules lacks a test through its public interface for the behaviour you move, add it before moving code.
- core: one Hono sub-app per route group (`routes/session.ts`, `routes/codes.ts`, `routes/apps.ts`, `routes/roles.ts`, or what the groups really are), mounted with `app.route`. `createApp` keeps the wiring, CORS and the error handler. `app.test.ts` and the route tests don't change.
- Coolify: `coolify-config.ts`, `coolify-api.ts` and `coolify-deploy.ts`, or the seams the code shows.
- The generator: mount the stack under `apps/example` directly and delete the merge engine and its obsolete test, keeping the install digest snapshot unchanged. Rename anything still called a layer.
- core's `accessOf` queries the one slug, with tests for an unknown app, owner, open and role rules.
- Refactors go in their own commits, apart from any behaviour change. Update the API reports and docs the moves touch; this ticket runs after the first wave, so it owns them then.

**Blocked by:** 06, 07, 08, 10, 12

**Status:** done

- [x] core's routes live in one module per group, and `createApp` is wiring
- [x] coolify.ts is split along its seams
- [x] The generator has no merge engine, and no code calls anything a layer
- [x] `accessOf` queries one slug
- [x] The install digest snapshot and the route tests are unchanged
- [ ] The full gate passes: `pnpm check:all`

## Comments

**What I chose**

- Core's routes are five sub-apps in `packages/core/src/routes/`, each mounted at `/` with `app.route`, so every path still reads in full where it's defined:
  - `status.ts`: `/status`.
  - `session.ts`: `/.well-known/jwks.json`, `/session`, `/refresh`, `/setup`, `/login`, `/login/code` and `/logout`, with both sign-in limits. The JWKS sits here because it checks the tokens `/refresh` mints.
  - `codes.ts`, `roles.ts`: the owner's codes and roles.
  - `apps.ts`: `/launcher` and the `/apps` routes.
  - `context.ts`: what they share. That's `RouteContext` (core's options plus the memoised signing key; it extends `SessionContext`, so it goes straight to the session functions), `CoreEnv`, `readBody`, `fieldsOf`, `setSessionCookie` and the `viewer` middleware.
- `createApp` keeps the error handler, CORS, the two POST rules (JSON only, 16 KiB) and the signing key's memo. The parent's `onError` catches the sub-apps' errors, since they set none of their own.
- Coolify is three modules. `coolify-config.ts` reads `coolify.json`. `coolify-api.ts` holds `Coolify`, one request with its deadline, and what to check when a request fails. `coolify-deploy.ts` holds the desired state, the lookups, the sync, the plan, the waves and the polling. Its test file split the same way: `coolify-config.test.ts` and `coolify-deploy.test.ts`. The tests themselves didn't change.
- The generator mounts the example under `apps/example` with a loop, and `readLayer`, `overlay`, `mergeManifests` and `deepMerge` are gone. The base template has no `apps/example`, so the merge never ran. I deleted the test "merges each layer's scripts and dependencies into the root manifest". The default install's snapshot already pins that manifest's text.
- `accessOf` is now one query: the app, left-joined to its roles in name order. A new test asks four slugs (open, owner, roles and unknown) on a core with several apps. It passes on the old `accessOf` and the new one.
- "group" is a glossary Avoid word, so the code and docs say "module of routes".

**Proof**

- `pnpm check`: 44 of 44 tasks pass.
- Core's whole suite in WSL with Postgres (`pnpm --filter @robkit/core test`): 21 files and 239 tests pass after the split and the new `accessOf`. The new pin test also passes with the old `accessOf` copied back in.
- On the final tree in WSL: create-robkit, 20 files and 201 tests pass; core, 21 files and 239 tests pass.
- `git diff 53-round-2 -- packages/create-robkit/src/__snapshots__` is empty, and so are the diffs of `app.db.test.ts` and the other route tests. The only test diff in core is the added `apps.db.test.ts` case.
- `pnpm --filter @internal/repo-checks api:update` changed nothing.
- I raised the coverage thresholds: core's to 96/95/91/97 and create-robkit's to 73/66/80/74 (statements, branches, functions, lines). Windows and Linux measure create-robkit the same.

**Not verified**

- I didn't run `pnpm check:all` or e2e; the coordinator runs those on the merged round.

**For ticket 09 and the coordinator**

- I edited one line each in `packages/core/README.md` (where core's routes live) and `packages/create-robkit/README.md` (the Coolify modules). The brief gives 09 the READMEs and gives this ticket the docs for the modules it splits, so expect a small merge there.
- 09's `Viewer` to `Profile` rename now reaches `routes/session.ts` (`claim.viewer`, `result.viewer`, `forGuard.viewer`) and `routes/context.ts` (`answer.viewer`), not `app.ts`. Its `session-token.ts` to `mint-token.ts` rename changes the import in `routes/session.ts`.
- `tooling/repo-checks/src/glossary.ts` now points its "service token" exception at `coolify-api.ts`.
