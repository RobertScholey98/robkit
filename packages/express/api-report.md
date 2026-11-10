# @robkit/express API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/express

```ts
export function coreOrigin(): CoreOrigin {
  return orExit(readCoreUrl(process.env));
}
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
