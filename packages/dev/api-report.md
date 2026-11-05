# @robkit/dev API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/dev

```ts
export interface App {
  slug: Slug;
  dir: string;
  port: number;
  migrates: boolean;
  declares: Declares;
}
export interface AppManifest {
  name?: string;
  scripts: Record<string, string>;
  declares: Declares;
}
export function appManifestIn(
  root: string,
  folder: string,
): Promise<AppManifest | undefined>;
export function catalogOf(apps: readonly App[]): string;
export function createProxy(routes: readonly Route[]): Server;
export function databasePassword(secret: string, slug: Slug): string;
export function databaseUrl(
  adminUrl: string,
  slug: Slug,
  password: string,
): string;
export function discoverApps(root: string, firstPort?: number): Promise<App[]>;
export class Problem extends Error {
  name: string;
}
export function provisionApps(
  root: string,
  { adminUrl, env, signal }: ProvisionOptions,
): Promise<Map<Slug, string>>;
export interface ProvisionConfig {
  adminUrl: string;
  secret: string;
  slugs: Slug[];
}
export function provisionDatabase(
  adminUrl: string,
  slug: Slug,
  password?: string,
): Promise<string>;
export function provisionDatabases({
  adminUrl,
  secret,
  slugs,
}: ProvisionDatabasesOptions): Promise<Map<Slug, string>>;
export interface ProvisionDatabasesOptions {
  adminUrl: string;
  secret: string;
  slugs: readonly Slug[];
}
export interface ProvisionOptions {
  adminUrl: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}
export function readAppManifest(
  value: unknown,
  file: string,
): AppManifest | InputProblem;
export function readProvisionConfig(env: Env): ProvisionConfig | InputProblem;
export const reportFaultsAt: "https://github.com/RobertScholey98/robkit/issues";
export interface Route {
  host: string;
  app: string;
  port: number;
}
export function routesFor(apps: readonly App[], domain: string): Route[];
export function runCommand(
  main: () => Promise<number | undefined>,
  print?: (...line: unknown[]) => void,
): Promise<number>;
export function runDev(root: string, env: NodeJS.ProcessEnv): Promise<number>;
```
