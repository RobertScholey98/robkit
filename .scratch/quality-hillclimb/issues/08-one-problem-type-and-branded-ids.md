# 08: One problem type, and brands for every id

**What to build:** A failed read has one type everywhere, `InputProblem`, checked one way, `isProblem`, and lint refuses the alternatives. Every id that changes who gets in is a brand, made only by its reader. No file in the repo, tooling included, casts parsed JSON.

The round-1 reviewers found `| { error: string }` and `"error" in x` beside `InputProblem` and `isProblem` in core's `owner.ts`, `roles.ts`, `access-codes.ts`, `apps.ts` and `app.ts` (`readBody`), create-robkit's `add.ts`, and session's `readSlug`. Address helpers (`install().host`, `origin`) take any string, so `bad/path` became `http://bad`. Role and code ids are plain strings. Tooling has about 12 `JSON.parse(...) as X` casts that `no-unsafe-type-assertion` doesn't see. The manifest icon reader says "one emoji" but checks only length. The generated core-client's `isRecord` accepts arrays where session's doesn't.

Raises rubric categories 3 (type safety), 6 (consistency) and 4 (naming). Evidence: `../research/council-r1-opus.md` sections 3, 4 and 6, `../research/council-r1-sol.md` sections 2, 3 and 6, `../research/council-r1-sonnet.md` sections 2, 3 and 9.

- Replace every hand-written `{ error: string }` result with `InputProblem` and every `"error" in` check with `isProblem`, including `readSlug`, core's readers and `readBody`, and the templates. Add a lint rule (a `no-restricted-syntax` selector or a `robkit/` rule with tests) that fails on a `{ error: string }` type literal and on `"error" in`, pointing at `docs/conventions/input.md`.
- Ban `as` on `JSON.parse(...)` and `.json()` results everywhere, tests aside, and replace the casts in `tooling/` with readers or a small shared `readJsonFile(path, read)`.
- Address helpers in `@robkit/session/addresses` take a `Slug`. Add a type test that a plain string doesn't compile, and a runtime test for a malformed slug at the edge that reads it. `GuardFault.app` is a `Slug`.
- `RoleId` and `CodeId` brands in `@robkit/guard`, used in `AccessRule` and the viewers, made only by core's readers and `readAccessRule`, with `@ts-expect-error` cases in `guard.test-d.ts`.
- Make the icon reader check what its message says (one emoji grapheme, with `Intl.Segmenter`), or change the message to what it checks. Add adversarial cases.
- Give the template core-client's `isRecord` session's meaning, with parity tests.
- Update `docs/conventions/input.md` for the new lint rules. It is this ticket's to edit. List any other doc change under Comments.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] No `{ error: string }` result or `"error" in` check is left, and lint fails on a new one
- [ ] No `as` on parsed JSON anywhere outside tests, and lint fails on a new one
- [ ] Address helpers and `GuardFault.app` take `Slug`, with type and runtime tests
- [ ] `RoleId` and `CodeId` are brands, with type tests
- [ ] The icon reader checks what its message says
- [ ] core-client's `isRecord` matches session's
- [ ] The full gate passes: `pnpm check:all`
