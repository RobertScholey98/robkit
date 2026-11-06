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
  app: Slug;
  access?: AccessRule | undefined;
  core: string;
  onUnavailable?: ((fault: GuardFault) => void) | undefined;
}
export interface GuardFault {
  app: Slug;
  failed: "core-key" | "access-rule" | "network";
  cause: unknown;
}
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
export type Report = (message: string, cause?: unknown) => void;
export const reportToConsole: Report;
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
      id: CodeId;
      roles: RoleId[];
    };
```

## @robkit/session/app-env

```ts
export function readDevServerEnv(env: Env):
  | {
      port?: number;
      domain?: string;
    }
  | InputProblem;
export function readGuardEnv(env: Env):
  | {
      app: Slug;
      core: string;
    }
  | InputProblem;
export function readServeEnv(env: Env):
  | {
      host: string;
      port: number;
    }
  | InputProblem;
```

## @robkit/session/addresses

```ts
export const defaultDevPort: 3000;
export const defaultDomain: "robkit.localhost";
export function install({ domain, protocol, port }: InstallOptions): Install;
export interface Install {
  readonly domain: string;
  host(slug: Slug): string;
  origin(slug: Slug): string;
  onInstall(url: string | undefined): string | undefined;
  appOf(url: string | URL): Slug | undefined;
}
export function installAt(url: string | URL, app: string): Install | undefined;
export interface InstallOptions {
  domain: string;
  protocol?: "http" | "https";
  port?: number | undefined;
}
export function isLocal(domain: string): boolean;
export function isPlatformApp(slug: string): slug is PlatformApp;
export type PlatformApp = (typeof platformApps)[number];
export const platformApps: readonly ["core", "hub", "admin"];
export function readSlug(value: unknown): Slug | InputProblem;
export type Slug =
  | PlatformApp
  | (string & {
      readonly [slugBrand]: true;
    });
export function slugProblem(name: string): string | undefined;
```

## @robkit/session/input

```ts
export function allProblems(...reads: unknown[]): InputProblem;
export type Env = Readonly<Record<string, string | undefined>>;
export interface InputProblem {
  readonly error: string;
}
export function isDomain(value: string): boolean;
export function isProblem(value: unknown): value is InputProblem;
export function isRecord(value: unknown): value is Record<string, unknown>;
export function parseJson(
  text: string,
  source: string,
):
  | {
      json: unknown;
    }
  | InputProblem;
export function readAppSlug(env: Env): Slug | InputProblem;
export function readCoreUrl(env: Env): string | InputProblem;
export function readDatabaseUrl(
  env: Env,
  name?: string,
  unsetFix?: string,
): string | InputProblem;
export function readDomain(env: Env, fallback?: string): string | InputProblem;
export function readHost(env: Env): string | InputProblem;
export function readPort(
  env: Env,
  name?: string,
  fallback?: number,
): number | InputProblem;
export function readSet(
  env: Env,
  name: string,
  fix: string,
): string | InputProblem;
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

## @robkit/session/manifest

```ts
export interface AppDeclaration {
  access?: DeclaredAccess;
  icon?: string;
}
export function appDeclarationJson({
  access,
  icon,
}: AppDeclaration): Record<string, unknown>;
export type DeclaredAccess =
  | {
      kind: "open";
    }
  | {
      kind: "owner";
    }
  | {
      kind: "roles";
      roleNames: string[];
    };
export interface DeclaredApp extends AppDeclaration {
  slug: Slug;
}
export function readAppDeclaration(
  value: unknown,
  field?: string,
): AppDeclaration | InputProblem;
export function readDeclaredApp(
  value: unknown,
  field: string,
): DeclaredApp | InputProblem;
```
