# @robkit/core API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/core

```ts
export interface CoreConfig {
  databaseUrl: string;
  domain: Domain;
  apps: ListedApp[];
  trustedProxy?: TrustedProxy;
  host: string;
  port: number;
}
export interface CoreOptions {
  db: Database;
  domain: string;
  now?: () => Date;
  trustedProxy?: TrustedProxy | undefined;
  logError?: Report;
}
export function createApp({
  db,
  domain,
  now,
  trustedProxy,
  logError,
}: CoreOptions): Hono;
export function createDatabase(databaseUrl: string): Database;
export interface Database extends Connection {}
export function ensureSigningKey(db: Database): Promise<SigningKey>;
export function migrate(databaseUrl: string): Promise<void>;
export function readCoreConfig(env: Env): CoreConfig | InputProblem;
export function registerApps(
  db: Database,
  declared: readonly ListedApp[],
): Promise<void>;
export interface SigningKey {
  kid: string;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicJwk: JWK;
}
export type TrustedProxy = "cloudflare";
```
