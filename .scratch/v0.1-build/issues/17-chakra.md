# 17: Chakra

**What to build:** Choosing Chakra at init adds `packages/ui` on Chakra and restyles the hub, admin and opted-in apps. Chakra doesn't go through the shadcn CLI, so it gets its own template layer, with the theme tokens mapped into Chakra's theme.

**Blocked by:** 15

**Status:** done

- [x] The kit's hub and admin pass an accessibility check and the guest journey
- [x] An app added with the kit off renders without importing `packages/ui`
- [x] Changing a token variable changes Chakra's rendering and the no-kit version the same way

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5

## Comments

Chosen in the build, awaiting R's review:

- The kit is `--ui-kit chakra`: Chakra UI 3.37.0, with `@emotion/react` 11.14.0, its peer, cataloged. 3.38.0 came out the same day, which pnpm refuses.
- Its `packages/ui` is written by hand, since Chakra has no CLI like shadcn's. It re-exports Chakra's components from `@internal/ui`, with a `Provider` and `system`. Every colour, radius and font in `src/system.ts` names a variable in `packages/theme/theme.css`: Chakra's default `gray` palette is the theme's primary and secondary, `red` its destructive colour, the radii are multiples of `--radius` as Tailwind's are, and fonts inherit the page's. A test checks the theme names no value of its own.
- Tailwind stays for the layout around Chakra's components: the kit's `styles.css` is Tailwind and the theme. So the hub's and admin's screens stay the no-kit ones, and only their `ui.tsx` changes, with the same exports and props.
- Each `ui.tsx` now exports `Root`, which the hub's and admin's `main.tsx` wrap the page in. Chakra's puts the page in its `Provider`. The no-kit and shadcn ones pass the page through. Apps put `Provider` in their own root: the Start root route and the React + Hono page.
- Chakra's type declarations import their own files without extensions, which TypeScript's `nodenext` resolution won't follow. The kit's layers set `module` to `preserve` in `packages/ui`, the hub, admin and each stack's tsconfig.
- Ark, under Chakra, draws a checkbox or radio as a control beside a native input shrunk to a pixel, so a click aimed at the input lands on the control. Admin's `Check` and `Choices` lay the invisible input over the whole label instead, so the journeys' `getByRole("checkbox").check()` works as on the other kits, and so does a click anywhere on the label.
- Chakra's reset is off (`preflight: false`), since Tailwind's runs. That left Chakra's reset layer empty, and Emotion writes an empty layer into server-rendered CSS as `@layer reset@layer base{…}`, which the browser drops with the default colour palette inside it. A server-rendered Start button had no background. The kit turns cascade layers off (`disableLayers: true`), and Chakra's styles still come after Tailwind's. `packages/ui`'s own test server-renders the provider and checks the palette is there and no at-rule runs into the next. It fails without the fix.
- The whole-stack React + Hono install carries the kit, and its added Start app uses it too, so both stacks draw with Chakra and the role journey drives its checkboxes and radios. The other installs with a kit add their app with `--no-ui-kit`. In production, the Prisma install has Chakra in place of Radix, whose apps share Base UI's layer.
- The production journey read the hub's first heading as soon as the page loaded. Chakra's hub starts up slower, so it read "Checking core…" instead of the setup screen. The journey now waits for that to go first.
- The third criterion is the theme journey, which runs in every whole-stack install. It reads the hub's sign-in button and card, sets new `--primary`, `--primary-foreground` and `--radius` values on the page, and reads them again. Every install, with no kit or any of the three, expects the same values before and after.

## Notes for later tickets

For 21 (kit matrix CI):

- Each kit has one whole-stack install: none (start), Chakra (react-hono, on both stacks), Radix (Prisma) and Base UI (Kysely). Production covers none, Chakra and Base UI.
- The theme journey takes under a second per install. It's the check that a kit reads the theme, so keep it on every kit.
- Building a Chakra app prints Ark UI's "use client" `MODULE_LEVEL_DIRECTIVE` warnings and Vite's chunk-size warning. Both are harmless; don't fail a job on them.
- Chakra's `packages/ui` has its own test, which the install's `pnpm test` runs.
