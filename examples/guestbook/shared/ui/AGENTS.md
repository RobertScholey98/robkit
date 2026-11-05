# packages/ui

The install's UI kit: shadcn's components on Base UI, in `src/components/ui`. They draw with the variables in `packages/theme/theme.css`, so change the install's look there, not here.

## Adding a component

From this folder:

```sh
pnpm exec shadcn add <component>
```

shadcn writes the component into `src/components/ui`, as `components.json` says, with its imports under `@internal/ui/`, which this package's exports resolve. The install's catalog holds every version, so if the component needs a new dependency, add its version under `catalog:` in `pnpm-workspace.yaml` first.

## Using it

An app lists `"@internal/ui": "workspace:*"`, imports a component from `@internal/ui/components/ui/<name>` and loads `@internal/ui/styles.css` in its stylesheet. `pnpm robkit add` gives every new app the kit.

The hub and admin draw every control through their own `ui.tsx` (admin's is `src/client/ui.tsx`), so their screens never import this package directly. Restyle a control there.
