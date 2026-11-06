# @robkit/start API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/start

```ts
export function guarded(
  entry: ServerEntry,
  options: GuardedOptions,
): ServerEntry;
export interface GuardedContext {
  viewer: Viewer;
}
export interface GuardedOptions {
  app: Slug;
  access?: AccessRule | undefined;
  core: CoreOrigin;
  onUnavailable?: ((fault: GuardFault) => void) | undefined;
}
export type Viewer =
  | SignedInViewer
  | {
      kind: "nobody";
    };
```
