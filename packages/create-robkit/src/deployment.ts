import {
  catalogOf,
  databasePassword,
  databaseUrl,
  discoverApps,
} from "@robkit/dev";
import { install, type Slug } from "@robkit/session/addresses";

/**
 * A variable's value on the host: written as is, or taken from one of the
 * host's shared variables, which the owner sets and which hold the secrets.
 */
export type Value = { literal: string } | { shared: string };

/** One app's container in production, and its environment. */
export interface Deployment {
  slug: Slug;
  env: Record<string, Value>;
}

/**
 * A proxy further out than the host's own, which names each visitor to
 * core: `cloudflare` behind a Cloudflare tunnel. Core's
 * `ROBKIT_TRUSTED_PROXY` takes the same values.
 */
export type TrustedProxy = "cloudflare";

export interface DeploymentOptions {
  /** The domain the install answers on, such as `robkit.dev`. */
  domain: string;
  /** The public https port, when it isn't 443. */
  port?: number;
  /** Set only when nothing but that proxy can reach the host. */
  trustedProxy?: TrustedProxy | undefined;
}

/** The port every app's container listens on. */
export const containerPort = 3000;

/** The host's shared variable that holds an app's `DATABASE_URL`. */
export function databaseUrlVariable(slug: string): string {
  return `${slug.toUpperCase()}_DATABASE_URL`;
}

/**
 * Every app's container in production, from the install at `root`: its
 * slug, its addresses over https, and for an app with a database, its
 * `DATABASE_URL` from the host. Core also gets the catalog, the apps the
 * provision step gives a database, and the admin URL and secret that step
 * needs, both from the host.
 */
export async function deploymentOf(
  root: string,
  { domain, port, trustedProxy }: DeploymentOptions,
): Promise<Deployment[]> {
  const apps = await discoverApps(root);
  const addresses = install({ domain, protocol: "https", port });
  const databases = apps.filter((app) => app.migrates).map((app) => app.slug);
  return apps.map(({ slug, migrates }) => {
    const env: Record<string, Value> = {
      ROBKIT_APP: { literal: slug },
      ROBKIT_DOMAIN: { literal: domain },
      ROBKIT_CORE_URL: { literal: addresses.origin("core") },
      PORT: { literal: String(containerPort) },
    };
    if (migrates) env.DATABASE_URL = { shared: databaseUrlVariable(slug) };
    if (slug === "core") {
      env.ROBKIT_APPS = { literal: catalogOf(apps) };
      env.ROBKIT_DATABASES = { literal: databases.join(",") };
      env.ROBKIT_ADMIN_DATABASE_URL = { shared: "ROBKIT_ADMIN_DATABASE_URL" };
      env.ROBKIT_DB_SECRET = { shared: "ROBKIT_DB_SECRET" };
      if (trustedProxy) env.ROBKIT_TRUSTED_PROXY = { literal: trustedProxy };
    }
    return { slug, env };
  });
}

/**
 * What the owner sets on the host once per app with a database: each app's
 * `DATABASE_URL`, by its shared variable's name, with the password the
 * provision step derives from the secret.
 */
export async function databaseUrls(
  root: string,
  { adminUrl, secret }: { adminUrl: string; secret: string },
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  for (const { slug, migrates } of await discoverApps(root)) {
    if (!migrates) continue;
    const password = databasePassword(secret, slug);
    urls.set(databaseUrlVariable(slug), databaseUrl(adminUrl, slug, password));
  }
  return urls;
}
