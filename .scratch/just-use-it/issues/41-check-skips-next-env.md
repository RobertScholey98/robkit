# 41: robkit check passes a Next app that has been built

**What to build:** In a Next.js install, `pnpm lint` fails once an app has been built or served. `next build` and `next dev` write `next-env.d.ts` to the app's folder, and the file imports Next's generated types from `dist`:

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./dist/types/routes.d.ts";
import "./dist/types/root-params.d.ts";
```

Milestone 4's fifth layer rule refuses an import of a file under `dist`, so `robkit check` prints two lines for each Next app and exits 1:

```text
apps/example/next-env.d.ts:3:8  Layer rule: an app or shared package imports no file under node_modules, dist, build, a dot-folder or a symlinked folder, since robkit check doesn't read them. Keep source out of those folders, and import a package by its name.
apps/example/next-env.d.ts:4:8  Layer rule: an app or shared package imports no file under node_modules, dist, build, a dot-folder or a symlinked folder, since robkit check doesn't read them. Keep source out of those folders, and import a package by its name.
```

The app's `.gitignore` names `next-env.d.ts`, and the app's `tsconfig.json` leaves it out, so robkit wrote none of it and the owner can't fix it. `pnpm dev` runs `next dev`, so every Next install that has run `pnpm dev` fails `pnpm lint`. CI lints a fresh checkout, which has no `next-env.d.ts`, so CI passes.

Found while catching the docs site up with milestone 4, in an install made with `--stack next` from `docs-site` at `7bc45f2a`. After `pnpm build` in `apps/example` and in an app `robkit add notes --stack next` made, `pnpm robkit check` printed the lines above for both.

- **A file Next writes is not the app's source.** `robkit check` passes an app whose only such import is Next's own `next-env.d.ts`. For example, it skips a file the app's `.gitignore` names, or `next-env.d.ts` by name.
- **The rule still holds for the app's own files.** A source file that imports from `dist` is still refused.

**Blocked by:** none

**Status:** needs-triage

- [ ] `pnpm lint` passes in a Next install after `pnpm build` and after `pnpm dev`
- [ ] `robkit check` still refuses an app's own file that imports from `dist`
- [ ] The PR's CI `gate` job passes on GitHub
