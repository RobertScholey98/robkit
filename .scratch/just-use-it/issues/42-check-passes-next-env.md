# 42: robkit check passes a Next app that has been built

**What to build:** In a Next.js install, `pnpm lint` fails once an app has been built or served. `next build` and `next dev` write `next-env.d.ts` to the app's folder, and the file imports Next's generated types from `dist`:

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./dist/types/routes.d.ts";
import "./dist/types/root-params.d.ts";
```

[Ticket 23](23-check-says-what-it-proves.md)'s rule refuses an import of a file under `dist`, so `robkit check` prints two lines for each Next app and exits 1:

```text
apps/example/next-env.d.ts:3:8  Layer rule: an app or shared package imports no file under node_modules, dist, build, a dot-folder or a symlinked folder, since robkit check doesn't read them. Keep source out of those folders, and import a package by its name.
apps/example/next-env.d.ts:4:8  Layer rule: an app or shared package imports no file under node_modules, dist, build, a dot-folder or a symlinked folder, since robkit check doesn't read them. Keep source out of those folders, and import a package by its name.
```

The app's `.gitignore` names `next-env.d.ts`, and the app's `tsconfig.json` leaves it out, so robkit wrote none of it and the owner can't fix it. `pnpm dev` runs `next dev`, so every Next install that has run `pnpm dev` fails `pnpm lint`. CI lints a fresh checkout, which has no `next-env.d.ts`, so CI passes.

The docs site's builder found this on 2026-11-11 while catching the site up with milestone 4, in an install made with `--stack next`. After `pnpm build` in `apps/example` and in an app `robkit add notes --stack next` made, `pnpm robkit check` printed the lines above for both. The builder wrote this ticket, and the lead moved it here to fix on `main`.

- **A file Next writes is not the app's source.** `robkit check` passes an app whose only such import is in Next's own `next-env.d.ts`.
- **The rule still holds for the app's own files.** A source file that imports from `dist` is still refused.

**Blocked by:** 23

**Status:** done

- [x] `robkit check` passes an app that holds the `next-env.d.ts` Next writes
- [x] `robkit check` still refuses an app's own file that imports from `dist`
- [x] The changeset for ticket 23's rule says what it lets through
- [x] `SECURITY.md` lists the way past the lint that this opens
- [x] `pnpm lint` passes in a Next install after `pnpm dev`, shown in a real install
- [x] The PR's CI `gate` job passes on GitHub

## Comments

### Chosen in the build, 2026-11-11

- The rule lets one `.d.ts` file import another, wherever the other is. A `.d.ts` file holds types, not code, so such an import brings no source in by mistake from a folder the check doesn't read. That is what `next-env.d.ts` does, and it covers any other tool that writes a `.d.ts` file pointing at its generated types.
- It names no file. The install's ESLint config ignores `next-env.d.ts` by name, but a name would cover Next alone, and a file called `next-env.d.ts` in another stack's app would go unread.
- It doesn't read `.gitignore`. Skipping what git ignores is sound too, since an ignored file isn't in a clone, but it needs git's own matching and a check that runs differently with no repository.
- Both ends must be `.d.ts` files. A script that imports a `.d.ts` file from `dist` is still refused, and so is a `.d.ts` file that imports a script from there. Tests cover both.
- It opens one way past the lint, which `SECURITY.md` now lists. Node runs a `.d.ts` file that a script imports by path, and whatever that file imports. So a script can import its own `types.d.ts`, which imports `./dist/hidden.d.ts`, and Node runs the code in both. I ran that on Node 24.22.1. `tsc` refuses the script's import when it binds a name, with TS2846. It passes `import "./types.d.ts"`, since the install's `skipLibCheck` keeps it from reading the code in a `.d.ts` file. Nobody writes code into a `.d.ts` file under `dist` by mistake, and the check is a lint, not a boundary, as [ticket 23](23-check-says-what-it-proves.md) says.
- No new changeset. The rule hasn't been released, so `check-reads-skipped-folders.md` gains a sentence, and an owner reads of the rule as it ships.

### Shown in a real install, 2026-11-11

In WSL, in an install made with `pnpm create-install --stack next` from this branch, on Next 16.4.5:

- `pnpm build` in `apps/example` wrote the `next-env.d.ts` above. `pnpm robkit check` and `pnpm lint` in the install then exited 0.
- With `dist` and the file removed, the app's `next dev`, which `pnpm dev` runs, wrote the file again. This time it imports `./dist/dev/types/routes.d.ts` and `./dist/dev/types/root-params.d.ts`. `pnpm robkit check` and `pnpm lint` exited 0 again.

I ran `next dev` by hand with `ROBKIT_APP` and `ROBKIT_CORE_URL` set, not through `pnpm dev`, which would also start Postgres and the other apps.

### Merged

Added by the lead. PR 134 merged into `main` on 2026-11-11 as `6cb4ec7c`, with `gate` green on `b31eab4`.

The fix reaches the docs site's branch with the next merge of `main` into `docs-site`. The layer rule page there then needs one sentence for the `.d.ts` file rule, which the builder has been told.
