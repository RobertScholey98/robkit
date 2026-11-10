import {
  allProblems,
  type Env,
  type InputProblem,
  isProblem,
  problem,
  readDatabaseUrl,
  readSet,
  readSlug,
  type Slug,
} from "@robkit/input";

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
      return problem(`ROBKIT_DATABASES: ${slug.error}`);
    }
    slugs.push(slug);
  }
  if (isProblem(adminUrl) || isProblem(secret)) {
    return allProblems(adminUrl, secret);
  }
  return { adminUrl, secret, slugs };
}
