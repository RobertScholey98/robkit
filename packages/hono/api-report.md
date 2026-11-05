# @robkit/hono API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/hono

```ts
export function guarded(options: GuardedOptions): MiddlewareHandler<GuardedEnv>;
export interface GuardedEnv {
  Variables: {
    viewer: Viewer;
  };
}
export interface GuardedOptions {
  app: string;
  access?: AccessRule | undefined;
  core: string;
}
export type Viewer =
  | SignedInViewer
  | {
      kind: "nobody";
    };
```
