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

## @robkit/start/testing

```ts
export { guest } from "@robkit/guard/testing";
export interface GuestOptions {
  id?: string;
  roles?: readonly string[];
}
export { nobody } from "@robkit/guard/testing";
export { owner } from "@robkit/guard/testing";
```

## @robkit/start/serve

```ts
export function serve(options?: ServeOptions): Promise<Server>;
export interface ServeOptions extends ServerOptions {
  client?: string;
  server?: string;
}
```
