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

## @robkit/express/testing

```ts
export function guardedAs(
  viewer: Viewer,
): (req: ExpressRequest, res: GuardedResponse, next: NextFunction) => void;
export { guest } from "@robkit/guard/testing";
export interface GuestOptions {
  id?: string;
  roles?: readonly string[];
}
export { nobody } from "@robkit/guard/testing";
export { owner } from "@robkit/guard/testing";
```

## @robkit/express/serve

```ts
export function serve(app: RequestHandler, options?: ServeOptions): Server;
export interface ServeOptions extends ServerOptions {
  assets?: string;
  public?: string;
}
```
