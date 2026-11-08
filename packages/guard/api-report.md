# @robkit/guard API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/guard

```ts
export type AccessRule =
  | {
      kind: "open";
    }
  | {
      kind: "roles";
      roles: RoleId[];
    }
  | {
      kind: "owner";
    };
export type CodeId = string & {
  readonly [codeIdBrand]: true;
};
export type Decision =
  | {
      outcome: "allow";
      viewer: Viewer;
    }
  | {
      outcome: "login";
    }
  | {
      outcome: "refresh";
    }
  | {
      outcome: "not-found";
    };
export function guard(rule: AccessRule, session: SessionState): Decision;
export function readAccessRule(value: unknown): AccessRule | InputProblem;
export function readCodeId(value: unknown): CodeId | InputProblem;
export function readRoleId(value: unknown): RoleId | InputProblem;
export function readRoleIds(value: unknown): RoleId[] | InputProblem;
export type RoleId = string & {
  readonly [roleIdBrand]: true;
};
export type SessionState =
  | {
      state: "unknown";
    }
  | {
      state: "signed-out";
    }
  | {
      state: "expired";
    }
  | {
      state: "signed-in";
      viewer: SignedInViewer;
    };
export type SignedInViewer = OwnerViewer | GuestViewer;
export type Viewer =
  | SignedInViewer
  | {
      kind: "nobody";
    };
```

## @robkit/guard/conformance

```ts
export interface ConformanceCase {
  name: string;
  rule: AccessRule;
  session: (typeof sessions)[number];
  guestRoles?: RoleId[];
  otherToken?: (typeof otherTokens)[number];
  outcome: Decision["outcome"];
}
export const conformanceCases: ConformanceCase[];
export function readConformanceCases(value: unknown): ConformanceCase[];
```
