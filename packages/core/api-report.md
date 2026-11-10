# @robkit/core API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/core

```ts
export interface CoreConfig {
  databaseUrl: string;
  origin: CoreOrigin;
  apps: ListedApp[];
  trustedProxy?: TrustedProxy;
  host: string;
  port: number;
}
export interface CoreOptions {
  db: Database;
  origin: CoreOrigin;
  now?: () => Date;
  trustedProxy?: TrustedProxy | undefined;
  logError?: Report;
  signInLimits?: Partial<SignInLimits>;
}
export function createApp({
  db,
  origin,
  now,
  trustedProxy,
  logError,
  signInLimits,
}: CoreOptions): Hono;
export function createDatabase(databaseUrl: string): Database;
export type Database = ReturnType<typeof connect>;
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
export interface SignInLimits {
  passwordsPerClient: number;
  codesPerClient: number;
  clientWindowMs: number;
  codesPerInstall: number;
  installWindowMs: number;
  clientsTracked: number;
  passwordChecksAtOnce: number;
  passwordChecksWaiting: number;
}
export type TrustedProxy = "cloudflare";
```
