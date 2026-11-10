# @robkit/next API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/next

```ts
export { coreOrigin } from "@robkit/session";
export function guarded(
  options?: GuardedOptions,
): (request: Request) => Promise<Response>;
export interface GuardedOptions extends GuardSettings {
  app?: string | undefined;
  access?: AccessRule | undefined;
  core?: string | undefined;
  onUnavailable?: ((fault: GuardFault) => void) | undefined;
}
export function viewer(): Promise<Viewer>;
export type Viewer =
  | SignedInViewer
  | {
      kind: "nobody";
    };
```

## @robkit/next/testing

```ts
export { guest } from "@robkit/guard/testing";
export interface GuestOptions {
  id?: string;
  roles?: readonly string[];
}
export { nobody } from "@robkit/guard/testing";
export { owner } from "@robkit/guard/testing";
```

## @robkit/next/config

```ts
export function withRobkit(config?: NextConfig): (phase: string) => NextConfig;
```

## @robkit/next/serve

```ts
export function serve(options?: ServeOptions): Promise<Server>;
export type ServeOptions = ServerOptions;
```
