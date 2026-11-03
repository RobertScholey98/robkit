# packages/ui

The install's UI kit: Chakra UI, with its theme in `src/system.ts`. Every colour, radius and font in that theme names a variable in `packages/theme/theme.css`, so change the install's look there, not here. Change `src/system.ts` only to map another of Chakra's tokens onto a theme variable.

## Using it

An app lists `"@internal/ui": "workspace:*"`, wraps its page in `Provider`, imports Chakra's components from `@internal/ui`, and loads `@internal/ui/styles.css` in its stylesheet. That stylesheet is Tailwind and the theme, for the layout around the components. Style a Chakra component with its own props, such as `rounded="xl"`, not Tailwind classes: Chakra's styles come later in the cascade and win. `pnpm robkit add` gives a new app the kit unless it's run with `--no-ui-kit`.

```tsx
import { Button, Provider } from "@internal/ui";
```

Chakra's components come from `@chakra-ui/react`, whose version is in the install's catalog in `pnpm-workspace.yaml`.

The hub and admin draw every control through their own `ui.tsx` (admin's is `src/client/ui.tsx`), whose `Root` wraps the page in `Provider`, so their screens never import this package directly. Restyle a control there.
