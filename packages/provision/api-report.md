# @robkit/provision API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/provision

```ts
export function databasePassword(
  secret: string,
  slug: Slug,
):
  | {
      outcome: "derived";
      password: string;
    }
  | ShortSecret;
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
): Promise<
  | {
      outcome: "provisioned";
      databaseUrl: string;
    }
  | RefusedApp
>;
export function provisionDatabases({
  adminUrl,
  secret,
  slugs,
}: ProvisionDatabasesOptions): Promise<
  | {
      outcome: "provisioned";
      databaseUrls: Map<Slug, string>;
    }
  | ProvisionRefusal
>;
export interface ProvisionDatabasesOptions {
  adminUrl: string;
  secret: string;
  slugs: readonly Slug[];
}
export type ProvisionRefusal = ShortSecret | RefusedApp;
export function readProvisionConfig(env: Env): ProvisionConfig | InputProblem;
export interface RefusedApp {
  outcome: "not-a-slug";
  slug: string;
  error: string;
}
export interface ShortSecret {
  outcome: "short-secret";
  error: string;
}
```
