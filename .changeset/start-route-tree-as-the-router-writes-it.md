---
"create-robkit": patch
---

The TanStack Start template's `src/routeTree.gen.ts` is now as TanStack Router writes it. The first `pnpm dev` in a new install, or after `robkit add` on that stack, no longer changes a file git tracks. In an install made before this, commit the file once after `pnpm dev` has rewritten it.
