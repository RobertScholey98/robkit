# @robkit/core API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/core

```ts
export interface CoreOptions {
  db: Database;
  domain: string;
  now?: () => Date;
  trustedProxy?: TrustedProxy | undefined;
}
export function createApp({ db, domain, now, trustedProxy }: CoreOptions): Hono;
export function createDatabase(
  databaseUrl: string,
): import("drizzle-orm/postgres-js").PostgresJsDatabase<
  Record<string, never>
> & {
  $client: postgres.Sql<{}>;
};
export type Database = ReturnType<typeof createDatabase>;
export interface DeclaredApp {
  slug: string;
  access?: AccessRule;
  icon?: string;
}
export function ensureSigningKey(db: Database): Promise<SigningKey>;
export function migrate(databaseUrl: string): Promise<void>;
export function readDeclaredApps(text: string | undefined): DeclaredApp[];
export function readTrustedProxy(
  value: string | undefined,
): TrustedProxy | undefined;
export function registerApps(
  db: Database,
  declared: readonly DeclaredApp[],
): Promise<void>;
export interface SigningKey {
  kid: string;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicJwk: JWK;
}
export type TrustedProxy = "cloudflare";
```
