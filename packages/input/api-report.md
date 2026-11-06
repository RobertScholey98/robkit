# @robkit/input API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/input

```ts
export function allProblems(...reads: unknown[]): InputProblem;
export type CoreOrigin = string & {
  readonly [coreOriginBrand]: true;
};
export type Domain = string & {
  readonly [domainBrand]: true;
};
export type Env = Readonly<Record<string, string | undefined>>;
export interface InputProblem {
  readonly error: string;
  readonly [problemMark]: true;
}
export function isDomain(value: string): value is Domain;
export function isPlatformApp(slug: string): slug is PlatformApp;
export function isProblem(value: unknown): value is InputProblem;
export function isRecord(value: unknown): value is Record<string, unknown>;
export function orExit<T>(read: T | InputProblem): T;
export function orThrow<T>(read: T | InputProblem): T;
export function parseJson(
  text: string,
  source: string,
):
  | {
      json: unknown;
    }
  | InputProblem;
export type PlatformApp = (typeof platformApps)[number];
export const platformApps: readonly ["core", "hub", "admin"];
export function problem(message: string): InputProblem;
export function readAppSlug(env: Env): Slug | InputProblem;
export function readCoreUrl(env: Env): CoreOrigin | InputProblem;
export function readDatabaseUrl(
  env: Env,
  name?: string,
  unsetFix?: string,
): string | InputProblem;
export function readDevServerEnv(env: Env):
  | {
      port?: number;
      domain?: Domain;
    }
  | InputProblem;
export function readDomain(env: Env, fallback?: string): Domain | InputProblem;
export function readGuardEnv(env: Env):
  | {
      app: Slug;
      core: CoreOrigin;
    }
  | InputProblem;
export function readHost(env: Env): string | InputProblem;
export function readPort(
  env: Env,
  name?: string,
  fallback?: number,
): number | InputProblem;
export function readServeEnv(env: Env):
  | {
      host: string;
      port: number;
    }
  | InputProblem;
export function readSet(
  env: Env,
  name: string,
  fix: string,
): string | InputProblem;
export function readSlug(value: unknown): Slug | InputProblem;
export type Slug =
  | PlatformApp
  | (string & {
      readonly [slugBrand]: true;
    });
export function slugProblem(name: string): string | undefined;
```

## @robkit/input/addresses

```ts
export function coreInstall(core: CoreOrigin): Install;
export const defaultDevPort: 3000;
export const defaultDomain: Domain;
export function install({ domain, protocol, port }: InstallOptions): Install;
export interface Install {
  readonly domain: Domain;
  host(slug: Slug): string;
  origin(slug: Slug): string;
  onInstall(url: string | undefined): string | undefined;
  appOf(url: string | URL): Slug | undefined;
}
export function installAt(url: string | URL, app: string): Install | undefined;
export interface InstallOptions {
  domain: Domain;
  protocol?: "http" | "https";
  port?: number | undefined;
}
export function isLocal(domain: string): boolean;
```

## @robkit/input/report

```ts
export type Report = (message: string, cause?: unknown) => void;
export const reportToConsole: Report;
```

## @robkit/input/manifest

```ts
export interface AppManifest {
  access?: ManifestAccess;
  icon?: string;
}
export function appManifestJson({
  access,
  icon,
}: AppManifest): Record<string, unknown>;
export interface ListedApp extends AppManifest {
  slug: Slug;
}
export type ManifestAccess =
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
export function readAppManifest(
  value: unknown,
  field?: string,
): AppManifest | InputProblem;
export function readListedApp(
  value: unknown,
  field: string,
): ListedApp | InputProblem;
```
