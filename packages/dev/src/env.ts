import {
  defaultDevPort,
  defaultDomain,
  readSlug,
  type Slug,
} from "@robkit/session/addresses";
import {
  allProblems,
  isProblem,
  readDatabaseUrl,
  readDomain,
  readPort,
  readSet,
  type Env,
  type InputProblem,
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
export function readDevConfig(env: Env): DevConfig | InputProblem {
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

/** What core's provision step needs in production. */
export interface ProvisionConfig {
  /** `ROBKIT_ADMIN_DATABASE_URL`: a superuser URL for the host's Postgres. */
  adminUrl: string;
  /** `ROBKIT_DB_SECRET`: every app role's password comes from it. */
  secret: string;
  /** `ROBKIT_DATABASES`: the apps with a database, comma-separated. */
  slugs: Slug[];
}

const fromHost =
  "robkit deploy sets it on core from the host's shared variable of that name.";

/** The provision step's settings, or every variable that won't do. */
export function readProvisionConfig(env: Env): ProvisionConfig | InputProblem {
  const adminUrl = readDatabaseUrl(env, "ROBKIT_ADMIN_DATABASE_URL", fromHost);
  const secret = readSet(env, "ROBKIT_DB_SECRET", fromHost);
  const slugs: Slug[] = [];
  for (const name of (env.ROBKIT_DATABASES ?? "").split(",")) {
    if (name.trim() === "") continue;
    const slug = readSlug(name.trim());
    if (isProblem(slug)) {
      return { error: `ROBKIT_DATABASES: ${slug.error}` };
    }
    slugs.push(slug);
  }
  if (isProblem(adminUrl) || isProblem(secret)) {
    return allProblems(adminUrl, secret);
  }
  return { adminUrl, secret, slugs };
}
