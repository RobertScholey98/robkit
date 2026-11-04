# 15: The UI kit layer, with shadcn on Base UI

**What to build:** Choosing shadcn on Base UI at init adds `packages/ui` through `shadcn init --base` and restyles the hub, admin and any app that opted in. This ticket builds the kit layer itself, so 16 and 17 only add a kit. With no kit, the hub and admin keep the plain JSX + Tailwind look styled like robnet's shadcn default. Theme tokens are the shared contract between the kit and the no-kit version.

**Blocked by:** 10, 25, 29

**Status:** done

- [x] The kit's hub and admin pass an accessibility check and the guest journey
- [x] An app added with the kit off renders without importing `packages/ui`
- [x] The no-kit hub and admin read the same token variables as the kit

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5

## Comments

Notes carried over from the finished tickets 05 and 09, which were deleted once done:

- Admin's `ui.tsx` is a copy of the hub's until a kit lands. (05)
- The wizard's UI kit question is No or a disabled Yes. Enable Yes, add "Which UI kit?" after it as in the prototype, and add `--ui` to the flags and to the printed command. (09)

Chosen in the build, awaiting R's review:

- Init doesn't run the shadcn CLI. The kit's `packages/ui` is shadcn's own output, committed as a template layer, so init needs no network and gives the same files every time, and the snapshot tests hold. `pnpm --filter create-robkit shadcn-kit base shadcn-base-ui` regenerates it from `shadcn init --base base --preset nova` at the cataloged CLI version, and fails if shadcn adds a dependency the kit's manifest or robkit's catalog lacks. Running it today reproduces the committed files.
- The tokens are `packages/theme/theme.css` in the `base` layer: shadcn's nova variables on neutral, with Geist. It is the only file that sets them, and a test checks that and that no hub or admin file uses a Tailwind palette colour.
- The seam is each platform app's `ui.tsx`. The no-kit layer holds the hub and admin, and a kit's `install` layer replaces only their `ui.tsx`, stylesheet and manifest, and adds `packages/ui`. The screens are the same files with or without a kit, which a test checks.
- An app uses the kit through the option's `optInLayer`, `ui-kits/<kit>/app/<stack>`. The example app always does. `robkit add` defaults to the kit when the install has one, asks "Use the install's UI kit?" in the wizard, and takes `--ui-kit` or `--no-ui-kit`. A `robkit/templates/<stack>` override replaces the template whole, kit layer included.
- `shadcn` is a dependency of `packages/ui`, as shadcn's own output has it, for its `shadcn/tailwind.css`.
- The accessibility check is axe through `@axe-core/playwright` in the whole-stack test, on every install's hub sign-in, launcher, admin, example app and added app. The whole-stack Kysely installs, dev and production, carry the kit.

## Notes for later tickets

For 16 (shadcn on Radix):

- Run `pnpm --filter create-robkit shadcn-kit radix shadcn-radix`. It writes `templates/ui-kits/shadcn-radix/install/packages/ui/src` and `components.json`, and rewrites `packages/theme/theme.css`, which should come out unchanged. Copy the rest from `shadcn-base-ui`: `packages/ui`'s `package.json` (swap `@base-ui/react` for what the script reports missing, likely `radix-ui`), `tsconfig.json`, `src/styles.css`, `AGENTS.md` and `CLAUDE.md`, the hub's and admin's `package.json` and `index.css`, and the whole `app/<stack>` folder.
- The hub's and admin's `ui.tsx` should need only small changes, since the exports are fixed by the screens. Check the props that differ: Radix's `Checkbox` passes `true | false | "indeterminate"` to `onCheckedChange`, and its `RadioGroup` passes a string to `onValueChange`.
- Then the table row: `layer: "ui-kits/shadcn-radix/install"`, `optInLayer: "ui-kits/shadcn-radix/app"`, drop `comingLater`, and catalog the new dependencies. The template-folder test fails until every stack has its `app/<stack>` folder.
- Base UI draws a checkbox as an ARIA control beside a hidden input, so the journeys find checkboxes and radios with `getByRole`, not `getByLabel`. Keep it that way.

For 17 (Chakra):

- Same seam, by hand: `install/packages/ui` on Chakra, the hub's and admin's `ui.tsx` with the same exports, and `app/<stack>` for each stack. The screens stay the no-kit ones.
- Map Chakra's semantic tokens to the CSS variables in `packages/theme/theme.css` (for example `colors.bg` to `var(--background)`), so the third criterion holds. `theme.test.ts` in create-robkit checks only `theme.css` sets a token. Extend its kit cases to Chakra.
- Chakra brings its own styling engine, so decide whether its hub and admin keep Tailwind for layout. The screens use Tailwind classes, so it likely has to.

For 21 (kit matrix CI):

- The UI kit is now a real axis. The role journey drives the kit's checkboxes and radios, so it now tests the kit too: run it on one install per kit, not only one per stack.
- Each install's axe check adds about three seconds. With `E2E_SCREENSHOTS` set, the journey saves each page, which a nightly job could keep as an artifact.
