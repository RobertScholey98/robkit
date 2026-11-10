# @robkit/start API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/start

```ts
export { coreOrigin } from "@robkit/session";
export function guarded(
  entry: ServerEntry,
  options?: GuardedOptions,
): ServerEntry;
export interface GuardedContext {
  viewer: Viewer;
}
export interface GuardedOptions extends GuardSettings {
  app?: string | undefined;
  access?: AccessRule | undefined;
  core?: string | undefined;
  onUnavailable?: ((fault: GuardFault) => void) | undefined;
}
export type Viewer =
  | SignedInViewer
  | {
      kind: "nobody";
    };
```
