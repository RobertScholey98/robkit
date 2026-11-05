# 02: Parse every input at its edge

**What to build:** Every value that enters robkit from outside its own code is parsed from `unknown` once, at the edge, by a reader that returns the typed value or a problem that names the file or variable and the key. HTTP bodies and token claims already work this way (`readBody` and the `read*` rules in `packages/core/src/app.ts`, `packages/session/src/session-token.ts`). Files, environment variables and process arguments don't: `robkit.json` and app manifests are cast (`packages/create-robkit/src/add.ts`, `packages/dev/src/apps.ts`, `packages/create-robkit/src/check.ts`), the Coolify config is half-checked then cast (`packages/create-robkit/src/coolify.ts`), and `PORT` goes through `Number` unchecked (`templates/base/apps/core/src/main.ts`).

Raises rubric categories 3 (type safety at the edges), 6 (consistency) and 2 (public API). See `../research/robkit-round-0.md`, sections 2, 3 and 6, for the specific sites, and `../research/t3code.md` section 3 for the pattern that scored 8 (decode files once, map read and shape failures explicitly).

- One reader pattern, used everywhere: a function from `unknown` to the value or a problem. Keep robkit's hand-written readers (no schema library) unless you find the hand-written approach can't express something, and then ask R first.
- Readers for `robkit.json`, an app's `package.json` and its `robkit` field, the Coolify config, `ROBKIT_APPS`, and every environment variable robkit reads (ports, hosts, `ROBKIT_*`). A malformed file, `null`, the wrong shape, a missing key and an out-of-range port each get a test and a message that says which file or variable, which key, and what to do.
- No unchecked type assertion in non-test source. Turn on `@typescript-eslint/no-unsafe-type-assertion` in `tooling/eslint` and fix every site it finds. `as const` stays. The templates are lint-checked by the install's own config; apply the same rule there.
- A `Slug` brand, made only by the slug reader, carried wherever a slug crosses a package boundary. Keep role names and role ids apart where mixing them would change who gets in.
- `GuardedRule` in `@robkit/session` makes `access` and `app` mutually exclusive in its type.
- Type tests (`*.test-d.ts` run by Vitest's typecheck mode) for the public API of `@robkit/guard`, `@robkit/session`, `@robkit/hono`, `@robkit/start` and `@robkit/react`, including what must not compile.
- `docs/conventions/input.md`: the reader convention in a page, with one example. Ticket 01 links it. List anything `AGENTS.md` should say under this ticket's `## Comments` instead of editing it.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] Every file, environment variable and argument robkit reads goes through a reader, and each reader has tests for the bad shapes above
- [ ] Each reader's problem names the file or variable, the key, and the fix
- [ ] `no-unsafe-type-assertion` is on, and no non-test source needs to disable it
- [ ] Slugs cross package boundaries as `Slug`
- [ ] `GuardedRule` can't hold both `access` and `app`, and a type test proves it
- [ ] Each adapter-facing package has type tests for its public API
- [ ] `docs/conventions/input.md` exists
- [ ] The gate passes: `pnpm turbo run lint typecheck test`
