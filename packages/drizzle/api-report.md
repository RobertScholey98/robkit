# @robkit/drizzle API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/drizzle

```ts
export function migrate({
  databaseUrl,
  folder,
  schema,
}: MigrateOptions): Promise<void>;
export interface MigrateOptions {
  databaseUrl: string;
  folder: string;
  schema?: string;
}
```
