# 68: `pnpm dev` changes no tracked file in a new install

**What to build:** The TanStack Start template ships `src/routeTree.gen.ts` as Prettier formats it, with double quotes and semicolons. TanStack Router writes that file again when the app starts, in its own style, with single quotes and no semicolons. So the first `pnpm dev` in a new install changes a file git tracks:

```text
 M apps/example/src/routeTree.gen.ts
```

The install's `.prettierignore` lists `**/routeTree.gen.ts`, so nothing puts it back. The owner sees a change they didn't make, and `robkit upgrade` refuses until it is committed or restored.

Found on 2026-11-11, in the robscholey.com install, straight after its first `pnpm dev`. The change was 32 lines, all of them quotes and semicolons.

- **The template's copy matches what the app writes.** Ship the file as TanStack Router writes it, and keep robkit's own Prettier off the template's copy. Or set the router's style in the template's `vite.config.ts`, if the pinned version takes one.
- **A test holds it for every stack.** After the whole-stack test's `pnpm dev`, `git status --porcelain` in the install prints nothing. That also catches the next file a stack's tooling rewrites, such as `next-env.d.ts`.

**Recommended:** ship the file as the app writes it. It needs no option that a later TanStack Router could drop.

**Blocked by:** none

**Status:** done

- [x] Once `pnpm dev` has started a committed install on each stack, and before the suite adds its app, `git status --porcelain` prints nothing, and a test holds it
- [x] `robkit add` on TanStack Start writes the same file
- [x] The changeset names create-robkit

## Comments

### Triage, 2026-11-12

R passed the triage of tickets 66 to 70 to a council round and to me. The council was Opus 5.5 and Sol 6.1, both at high, on `main` at `8ae537af`.

- **The test can't read `git status` at the end of a suite** (both). Each whole-stack suite runs `robkit add` while `pnpm dev` runs, and some change the install before it starts. So the suite commits the install before `pnpm dev`, and reads `git status` once the stack has started and before it adds the app.
- **The ticket's cause was half wrong** (Opus). robkit's own `.prettierignore` already lists `**/routeTree.gen.ts`. The template's copy was formatted before that line existed, so there is no Prettier step to add.
- **Ship the file as TanStack Router writes it.** Sol agreed. Opus would set `quoteStyle` and `semicolons` in the template's `vite.config.ts`. I ran both in the robscholey.com install on 2026-11-12, and each leaves `git status` clean. I kept the ticket's choice, since it adds nothing to a file the owner reads and edits. Nothing formats the route tree, and nobody reads it.
- I reproduced the bug first. `vite build` in that install's `apps/example` changed 32 lines of `src/routeTree.gen.ts`, with @tanstack/react-router 1.169.4.

### Chosen in the build, 2026-11-12

- The test is stricter than the ticket asked. `git status --porcelain` lists a new file git doesn't ignore as well as a changed one, so the test fails on either. All five stacks pass it, so `next-env.d.ts` and the rest are already tracked as their tools write them, or ignored.
- `useDevStack` reads `git status` once the stack has started, and `robkit add` waits for that reading. A suite can then ask for it in any test, in any order. `describeJourneys` commits the install before `pnpm dev`, with a name and email of its own, since CI's runner has none and init makes no first commit there.
- The Go install is the one that adds a Start app. Its suite checks that the added app's `src/routeTree.gen.ts` is still the template's file once the app is up. Both apps come from one template, so the example's test and this one hold the same file.

### Proof

- In WSL (Ubuntu 22.04, Node 24), with the old template file, "changes no file git tracks, and adds none git would" failed in the Start suite with `' M apps/example/src/routeTree.gen.ts\n'`, and the Go suite's route tree test failed. The other suites weren't run against the old file.
- With the fix, the test passes in all five suites, and the route tree test passes in the Go suite: 11 tests, with the journey that adds the app. `tooling/e2e`'s typecheck and lint pass.
- I ran those tests alone, not each suite whole. CI's `gate` runs the rest.
