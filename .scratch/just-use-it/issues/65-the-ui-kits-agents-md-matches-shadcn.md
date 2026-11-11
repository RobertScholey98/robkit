# 65: The UI kit's AGENTS.md says what shadcn does

**What to build:** The template's `packages/ui/AGENTS.md`, under "Adding a component", says two things a run in a new install didn't show.

- **The catalog.** It says to add a new dependency's version under `catalog:` in `pnpm-workspace.yaml` first. `pnpm exec shadcn add sonner` needed no such step: pnpm wrote `sonner` and `next-themes` to `packages/ui/package.json` as `catalog:` and added both to the catalog itself. It added them as `^` ranges, while the rest of the catalog holds exact versions.
- **The imports.** It says shadcn writes the component "with its imports under `@internal/ui/`". The new `switch.tsx` imported `cn` from the `cn` package, as the kit's own components do.

A third thing the file doesn't say: a component shadcn writes can fail the install's `tsc`. `sonner.tsx` did, with TS2375, because the install sets `exactOptionalPropertyTypes`. It also needs `pnpm format`, since shadcn writes no semicolons.

- Say what happens, in the order it happens: shadcn writes the file, pnpm adds any new dependency to the catalog, then `pnpm format` and `pnpm typecheck`.
- Decide whether the catalog should keep the `^` range pnpm writes, or the file should say to pin it.

The docs site's page on the UI kit says what the run showed, and repeats neither claim.

Found by the worker who wrote that page, in docs-site ticket 29.

**Blocked by:** none

**Status:** needs-triage

- [ ] "Adding a component" in `packages/create-robkit/templates/base/packages/ui/AGENTS.md` matches a run of `pnpm exec shadcn add` in a new install
- [ ] The changeset names create-robkit
