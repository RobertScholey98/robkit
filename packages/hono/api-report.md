# @robkit/hono API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/hono

```ts
export function coreOrigin(): CoreOrigin {
  return orExit(readCoreUrl(process.env));
}
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

## @robkit/hono/testing

```ts
export function guardedAs(viewer: Viewer): MiddlewareHandler<GuardedEnv>;
export function guest({
  id = "code-1",
  roles = [],
}: GuestOptions = {}): GuestViewer {
  return {
    kind: "guest",
    id: orThrow(readCodeId(id)),
    roles: roles.map((role) => orThrow(readRoleId(role))),
  };
}
export interface GuestOptions {
  id?: string;
  roles?: readonly string[];
}
export function nobody(): {
  kind: "nobody";
} {
  return { kind: "nobody" };
}
export function owner(id = "owner-1"): OwnerViewer {
  return {
    kind: "owner",
    id: orThrow(
      id === ""
        ? problem(`"" isn't the owner's id, which is text that isn't empty.`)
        : id,
    ),
  };
}
```
