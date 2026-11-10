# @robkit/provision API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/provision

```ts
export function databasePassword(secret: string, slug: Slug): string;
export function databaseUrl(
  adminUrl: string,
  slug: Slug,
  password: string,
): string;
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
export function readProvisionConfig(env: Env): ProvisionConfig | InputProblem;
```
