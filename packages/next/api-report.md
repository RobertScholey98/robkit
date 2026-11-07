# @robkit/next API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/next

```ts
export function guarded(
  options: GuardedOptions,
): (request: Request) => Promise<Response>;
export interface GuardedOptions {
  app: Slug;
  access?: AccessRule | undefined;
  core: CoreOrigin;
  onUnavailable?: ((fault: GuardFault) => void) | undefined;
}
export function viewer(): Promise<Viewer>;
export type Viewer =
  | SignedInViewer
  | {
      kind: "nobody";
    };
```
