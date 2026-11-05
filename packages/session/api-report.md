# @robkit/session API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/session

```ts
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
export interface GuardedOptions {
  app: string;
  access?: AccessRule | undefined;
  core: string;
  onUnavailable?: ((fault: GuardFault) => void) | undefined;
}
export interface GuardFault {
  app: string;
  failed: "core-key" | "access-rule" | "network";
  cause: unknown;
}
export function readAppToken(
  key: VerifyKey,
  token: string,
  now: Date,
  app: string,
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
      viewer: Viewer;
    }
  | {
      response: Response;
    };
export function requestGuard(
  options: GuardedOptions,
): (request: Request) => Promise<RequestDecision>;
export const sessionCookie: "robkit_session";
export type SessionTokenClaims = ViewerClaims & {
  sessionId: string;
};
export const sessionTokenLifetimeSeconds: number;
export function sessionTokensIn(
  cookieHeader: string | null | undefined,
): string[];
export type VerifyKey = CryptoKey | JWTVerifyGetKey;
export type ViewerClaims =
  | {
      kind: "owner";
      id: string;
    }
  | {
      kind: "guest";
      id: string;
      roles: string[];
    };
```

## @robkit/session/addresses

```ts
export const defaultDevPort: 3000;
export const defaultDomain: "robkit.localhost";
export function install({ domain, protocol, port }: InstallOptions): Install;
export interface Install {
  readonly domain: string;
  host(slug: string): string;
  origin(slug: string): string;
  onInstall(url: string | undefined): string | undefined;
  appOf(url: string | URL): string | undefined;
}
export function installAt(url: string | URL, app: string): Install | undefined;
export interface InstallOptions {
  domain: string;
  protocol?: "http" | "https";
  port?: number | undefined;
}
export function isLocal(domain: string): boolean;
export function isPlatformApp(slug: string): boolean;
export const platformApps: readonly ["core", "hub", "admin"];
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
