# @robkit/express API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/express

```ts
export { coreOrigin } from "@robkit/session";
export function guarded(
  options?: GuardedOptions,
): (
  req: ExpressRequest,
  res: GuardedResponse,
  next: NextFunction,
) => Promise<void>;
export interface GuardedLocals {
  viewer: Viewer;
}
export interface GuardedOptions extends GuardSettings {
  app?: string | undefined;
  access?: AccessRule | undefined;
  core?: string | undefined;
  onUnavailable?: ((fault: GuardFault) => void) | undefined;
}
export type GuardedResponse = ExpressResponse<unknown, GuardedLocals>;
export type Viewer =
  | SignedInViewer
  | {
      kind: "nobody";
    };
```
