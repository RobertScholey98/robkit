# @robkit/drizzle API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/drizzle

```ts
export function appDatabase<TSchema extends Record<string, unknown>>(
  schema: TSchema,
  options?: PoolOptions,
): () => AppDatabase<TSchema>;
export type AppDatabase<TSchema extends Record<string, unknown>> =
  PostgresJsDatabase<TSchema> & {
    $client: postgres.Sql;
  };
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
export type PoolOptions = postgres.Options<
  Record<string, postgres.PostgresType>
>;
```
