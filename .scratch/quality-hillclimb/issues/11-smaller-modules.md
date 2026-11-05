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

**Status:** ready-for-agent

- [ ] core's routes live in one module per group, and `createApp` is wiring
- [ ] coolify.ts is split along its seams
- [ ] The generator has no merge engine, and no code calls anything a layer
- [ ] `accessOf` queries one slug
- [ ] The install digest snapshot and the route tests are unchanged
- [ ] The full gate passes: `pnpm check:all`
