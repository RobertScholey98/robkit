import { defaultDevPort, defaultDomain } from "@robkit/session/addresses";
import {
  allProblems,
  isProblem,
  readDatabaseUrl,
  readDomain,
  readPort,
  type Env,
  type Problem,
} from "@robkit/session/input";

/** What `robkit-dev` runs with, read from its environment. */
export interface DevConfig {
  /** `ROBKIT_DOMAIN`: every app is on `<slug>.<domain>`. */
  domain: string;
  /** `ROBKIT_DEV_PORT`: where the proxy listens. Apps take the ports after. */
  devPort: number;
  /**
   * A superuser URL for the install's Postgres: `ROBKIT_DATABASE_URL`, or
   * Compose's on `ROBKIT_POSTGRES_PORT`.
   */
  adminUrl: string;
}

/** The dev runner's settings, or every variable that won't do. */
export function readDevConfig(env: Env): DevConfig | Problem {
  const domain = readDomain(env, defaultDomain);
  const devPort = readPort(env, "ROBKIT_DEV_PORT", defaultDevPort);
  const databaseUrl = env.ROBKIT_DATABASE_URL
    ? readDatabaseUrl(env, "ROBKIT_DATABASE_URL")
    : undefined;
  const postgresPort = readPort(env, "ROBKIT_POSTGRES_PORT", 54320);
  if (
    isProblem(domain) ||
    isProblem(devPort) ||
    isProblem(databaseUrl) ||
    isProblem(postgresPort)
  ) {
    return allProblems(domain, devPort, databaseUrl, postgresPort);
  }
  return {
    domain,
    devPort,
    adminUrl:
      databaseUrl ??
      `postgres://postgres:postgres@127.0.0.1:${String(postgresPort)}/robkit`,
  };
}
