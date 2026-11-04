# 16: shadcn on Radix

**What to build:** Choosing shadcn on Radix at init installs the kit through `shadcn init --base` on the layer from ticket 15, with its own hub and admin variants.

**Blocked by:** 15

**Status:** done

- [x] The kit's hub and admin pass an accessibility check and the guest journey
- [x] An app added with the kit off renders without importing `packages/ui`

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5

## Comments

Chosen in the build, awaiting R's review:

- The kit is `--ui-kit shadcn-radix`. Its `packages/ui` is `pnpm --filter create-robkit shadcn-kit radix shadcn-radix`'s output, as ticket 15 set up, with `radix-ui` 1.8.1 cataloged in place of `@base-ui/react`. The theme tokens came out unchanged, so both shadcn kits share `packages/theme/theme.css`.
- The hub's and admin's `ui.tsx` are the Base UI kit's. The only change: Radix's `Checkbox` reports `true | false | "indeterminate"`, and admin's `Check` maps anything but `true` to unchecked. Radix's `RadioGroup` already passes a string, which `Choices` looks up as before.
- The two shadcn kits share one app layer, `ui-kits/shadcn/app/<stack>`, moved out of the Base UI kit. An app draws only with shadcn's `Card`, which both kits have, so a copy would only drift.
- The Prisma install now carries the Radix kit, in dev and in production, and runs the role journey, which ticks Radix's checkboxes and radios. Each kit has one install that drives its controls, and no fifth install was needed. The Prisma suite's journeys take about 130s, most of it the role journey waiting out the access cache, in parallel with the other suites.
- The example app now declares the default icon, 📦, as `robkit add` gives every app. The launcher showed it without one.

## Notes for later tickets

For 17 (Chakra):

- Chakra can't use `ui-kits/shadcn/app`, since its apps draw with Chakra's components. Give its row its own `optInLayer`, `ui-kits/chakra/app`, with a folder per stack.
- Its `install` layer replaces the same files a shadcn kit does: `packages/ui`, the hub's and admin's `ui.tsx`, stylesheet and manifest. Keep `ui.tsx`'s exports and props as they are; the screens and the journeys depend on them, and the journeys find checkboxes and radios by role.
- Add Chakra's case to `theme.test.ts`, `add.test.ts`'s opt-out test and the generator's kit tests, as this ticket did for Radix.

For 21 (kit matrix CI):

- Three kits now have an install each in the whole-stack test: none (start, react-hono), Radix (Prisma) and Base UI (Kysely). Chakra will need one; pairing it with a stack or ORM another kit doesn't already cover keeps the count down.
- Under the full parallel gate, core's `verifyPassword` test failed once in WSL and passed five times alone. `verifyPassword` turns any scrypt error into `false`, so a failed 32 MB allocation under load reads as a wrong password. That's load, not this ticket, but it can flake a matrix run. Worth a ticket: refuse only an unreadable stored hash, and let other errors throw.
