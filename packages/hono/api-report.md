# @robkit/hono API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/hono

```ts
export function guarded(
  options?: GuardedOptions,
): MiddlewareHandler<GuardedEnv>;
export interface GuardedEnv {
  Variables: {
    viewer: Viewer;
  };
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
