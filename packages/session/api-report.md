# @robkit/session API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/session

```ts
export type AccessRuleFailure =
  "unknown-app" | "bad-answer" | "invalid-json" | "interrupted-body";
export function appOrigin(settings?: GuardSettings): string;
export const appRefreshPath: "/_robkit/refresh";
export const appSessionPath: "/_robkit/session";
export function appSessionUrl(
  next: string,
  {
    token,
    state,
  }: {
    token?: string | undefined;
    state?: string | undefined;
  },
): string;
export const coreAudience: "core";
export type Framers = "same-origin" | "none";
export interface GuardedOptions extends GuardSettings {
  app?: string | undefined;
  access?: AccessRule | undefined;
  core?: string | undefined;
  onUnavailable?: ((fault: GuardFault) => void) | undefined;
}
export type GuardFault = {
  app: Slug;
  cause: unknown;
} & (
  | {
      failed: "core-key" | "network";
    }
  | {
      failed: "access-rule";
      reason: AccessRuleFailure;
    }
);
export interface GuardSettings {
  app?: string | undefined;
  core?: string | undefined;
}
export function isRedirect(status: number): boolean;
export function readAppToken(
  key: VerifyKey,
  token: string,
  now: Date,
  app: Slug,
): Promise<ReadAppToken | undefined>;
export type ReadAppToken = ViewerClaims & {
  expired: boolean;
};
export function readSessionToken(
  key: VerifyKey,
  token: string,
  now: Date,
): Promise<ReadSessionToken | undefined>;
export type ReadSessionToken = SessionTokenClaims & {
  expired: boolean;
};
export type RequestDecision =
  | {
      outcome: "serve";
      viewer: Viewer;
      headers: readonly [string, string][];
    }
  | {
      outcome: "answer";
      response: Response;
    };
export function requestGuard(
  options?: GuardedOptions,
): (request: Request) => Promise<RequestDecision>;
export function securityHeaders(
  origin: string,
  framers: Framers | undefined,
): [string, string][];
export const sessionCookie: "robkit_session";
export function sessionCookies(origin: string): SessionCookies;
export interface SessionCookies {
  session: string;
  state: string;
  attributes: {
    path: "/";
    httpOnly: true;
    sameSite: "Lax";
    secure: boolean;
  };
}
export type SessionTokenClaims = ViewerClaims & {
  sessionId: string;
};
export const sessionTokenLifetimeSeconds: number;
export function sessionTokensIn(
  cookieHeader: string | null | undefined,
  origin: string,
): string[];
export type VerifyKey = CryptoKey | JWTVerifyGetKey;
export type ViewerClaims =
  | {
      kind: "owner";
      id: string;
    }
  | {
      kind: "guest";
      id: CodeId;
      roles: RoleId[];
    };
export function withHeaders(
  response: Response,
  headers: readonly [string, string][],
): Response;
```

## @robkit/session/lapsed

```ts
export function readSessionLapsed(
  response: Response,
): Promise<SessionLapsed | undefined>;
export interface SessionLapsed {
  outcome: "login" | "refresh";
  error: string;
  location: string;
}
export const sessionLapsedHeader: "robkit-session";
export function sessionLapsedResponse({
  outcome,
  error,
  location,
}: SessionLapsed): Response;
```
