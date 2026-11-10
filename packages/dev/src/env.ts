import {
  allProblems,
  type Env,
  type InputProblem,
  isProblem,
  readDatabaseUrl,
  readDomain,
  readPort,
  problem,
  type Domain,
} from "@robkit/input";
import {
  defaultDevPort,
  defaultDomain,
  isLocal,
} from "@robkit/input/addresses";

/** What `robkit-dev` runs with, read from its environment. */
export interface DevConfig {
  /**
   * `ROBKIT_DOMAIN`: every app is on `<slug>.<domain>`. Always local, as
   * `isLocal` says, since `pnpm dev` serves plain http.
   */
  domain: Domain;
  /** `ROBKIT_DEV_PORT`: where the proxy listens. Apps take the ports after. */
  devPort: number;
  /**
   * A superuser URL for the install's Postgres: `ROBKIT_DATABASE_URL`, or
   * Compose's on `ROBKIT_POSTGRES_PORT`.
   */
  adminUrl: string;
}

/**
 * The install's domain in development. `pnpm dev` serves plain http, and
 * only a local install may, so it must be `localhost` or a name under it.
 */
function readDevDomain(env: Env): Domain | InputProblem {
  const domain = readDomain(env, defaultDomain);
  if (isProblem(domain) || isLocal(domain)) return domain;
  return problem(
    `ROBKIT_DOMAIN is "${domain}", which isn't local. pnpm dev serves plain http, so it runs only on localhost or a name under it, such as robkit.localhost. Leave ROBKIT_DOMAIN unset, or deploy with robkit deploy to serve ${domain}.`,
  );
}

/** The dev runner's settings, or every variable that won't do. */
export function readDevConfig(env: Env): DevConfig | InputProblem {
  const domain = readDevDomain(env);
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
