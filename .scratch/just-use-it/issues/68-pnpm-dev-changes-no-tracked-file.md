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

**Status:** needs-triage

- [ ] After `pnpm dev` starts and stops in a new install on each stack, `git status --porcelain` prints nothing, and a test holds it
- [ ] `robkit add` on TanStack Start writes the same file
- [ ] The changeset names create-robkit
