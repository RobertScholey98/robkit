# @robkit/dev API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/dev

```ts
export interface App {
  slug: string;
  dir: string;
  port: number;
  migrates: boolean;
  declares: Declares;
}
export function catalogOf(apps: readonly App[]): string;
export function createProxy(routes: readonly Route[]): Server;
export function databasePassword(secret: string, slug: string): string;
export function databaseUrl(
  adminUrl: string,
  slug: string,
  password: string,
): string;
export function discoverApps(root: string, firstPort?: number): Promise<App[]>;
export class Problem extends Error {
  name: string;
}
export function provisionApps(
  root: string,
  { adminUrl, env, signal }: ProvisionOptions,
): Promise<Map<string, string>>;
export function provisionDatabase(
  adminUrl: string,
  slug: string,
  password?: string,
): Promise<string>;
export function provisionDatabases({
  adminUrl,
  secret,
  slugs,
}: ProvisionDatabasesOptions): Promise<Map<string, string>>;
export interface ProvisionDatabasesOptions {
  adminUrl: string;
  secret: string;
  slugs: readonly string[];
}
export interface ProvisionOptions {
  adminUrl: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}
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
export function slugProblem(name: string): string | undefined;
```
