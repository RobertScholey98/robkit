# @robkit/dev API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/dev

```ts
export interface App {
  slug: Slug;
  dir: string;
  port: number;
  migrates: boolean;
  manifest: AppManifest;
}
export interface AppManifestFile {
  name?: string;
  scripts: Record<string, string>;
  manifest: AppManifest;
}
export function appManifestFileIn(
  root: string,
  folder: string,
): Promise<AppManifestFile | undefined>;
export function catalogOf(apps: readonly App[]): string;
export function databasePassword(secret: string, slug: Slug): string;
export function databaseUrl(
  adminUrl: string,
  slug: Slug,
  password: string,
): string;
export function discoverApps(root: string, firstPort?: number): Promise<App[]>;
export interface ProvisionConfig {
  adminUrl: string;
  secret: string;
  slugs: Slug[];
}
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
export function readProvisionConfig(env: Env): ProvisionConfig | InputProblem;
```

## @robkit/dev/cli

```ts
export class CommandProblem extends Error {
  name: string;
}
export function exec(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    slug?: string;
  },
): Promise<void>;
export function isMissing(error: unknown): boolean;
export const reportFaultsAt: "https://github.com/RobertScholey98/robkit/issues";
export function runCommand(
  main: () => Promise<number | undefined>,
  report?: Report,
): Promise<number>;
```
