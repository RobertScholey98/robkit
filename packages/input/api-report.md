# @robkit/input API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/input

```ts
export function allProblems(...reads: unknown[]): InputProblem;
export interface AppDeclaration {
  access?: DeclaredAccess;
  icon?: string;
}
export function appDeclarationJson({
  access,
  icon,
}: AppDeclaration): Record<string, unknown>;
export type CoreOrigin = string & {
  readonly [coreOriginBrand]: true;
};
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
export type Domain = string & {
  readonly [domainBrand]: true;
};
export type Env = Readonly<Record<string, string | undefined>>;
export interface InputProblem {
  readonly error: string;
}
export function isDomain(value: string): boolean;
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
export function readAppDeclaration(
  value: unknown,
  field?: string,
): AppDeclaration | InputProblem;
export function readAppSlug(env: Env): Slug | InputProblem;
export function readCoreUrl(env: Env): CoreOrigin | InputProblem;
export function readDatabaseUrl(
  env: Env,
  name?: string,
  unsetFix?: string,
): string | InputProblem;
export function readDeclaredApp(
  value: unknown,
  field: string,
): DeclaredApp | InputProblem;
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
