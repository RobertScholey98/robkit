import { readSlug, type Slug } from "@robkit/session/addresses";
import {
  allProblems,
  isProblem,
  isRecord,
  readDatabaseUrl,
  readSet,
  type Env,
  type InputProblem,
} from "@robkit/session/input";
import type { Coolify } from "./coolify-api.ts";

const secretFix =
  "Set it to the install's database secret, at least 32 characters, such as the output of openssl rand -hex 32.";

/** What robkit database-urls needs: the host's admin URL and the secret. */
export function readDatabaseUrlsConfig(
  env: Env,
): { adminUrl: string; secret: string } | InputProblem {
  const adminUrl = readDatabaseUrl(
    env,
    "ROBKIT_ADMIN_DATABASE_URL",
    "Set it to the host's Postgres admin URL.",
  );
  const set = readSet(env, "ROBKIT_DB_SECRET", secretFix);
  const secret =
    typeof set === "string" && set.length < 32
      ? { error: `ROBKIT_DB_SECRET is too short. ${secretFix}` }
      : set;
  if (isProblem(adminUrl) || isProblem(secret)) {
    return allProblems(adminUrl, secret);
  }
  return { adminUrl, secret };
}

/**
 * How robkit deploy reaches Coolify, or undefined when `COOLIFY_URL` is
 * unset, as it is in an install's CI before Coolify is set up.
 */
export function readCoolify(env: Env): Coolify | undefined | InputProblem {
  const url = env.COOLIFY_URL;
  if (!url) return undefined;
  const protocol = URL.canParse(url) ? new URL(url).protocol : "";
  if (protocol !== "https:" && protocol !== "http:") {
    return {
      error: `COOLIFY_URL is "${url}", which isn't a web address. Set it to your Coolify's address, such as https://coolify.example.com.`,
    };
  }
  const token = readSet(
    env,
    "COOLIFY_TOKEN",
    "Set it to a Coolify API token to deploy.",
  );
  if (isProblem(token)) return token;
  const {
    CF_ACCESS_CLIENT_ID: accessId,
    CF_ACCESS_CLIENT_SECRET: accessSecret,
  } = env;
  if (!accessId !== !accessSecret) {
    const missing = accessId
      ? "CF_ACCESS_CLIENT_SECRET"
      : "CF_ACCESS_CLIENT_ID";
    return {
      error: `${missing} is not set. Set both CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET when Cloudflare Access guards Coolify, or neither.`,
    };
  }
  return {
    url,
    token,
    ...(accessId && accessSecret && { accessId, accessSecret }),
  };
}

/** `--apps`: a comma-separated list of slugs. */
export function readAppList(value: string): Slug[] | InputProblem {
  const slugs: Slug[] = [];
  for (const name of value.split(",")) {
    const slug = readSlug(name.trim());
    if (isProblem(slug)) return { error: `--apps: ${slug.error}` };
    slugs.push(slug);
  }
  return slugs;
}

/**
 * The apps in what `turbo ls --affected --output json` printed, by slug.
 * Packages outside `apps/` aren't apps.
 */
export function readAffectedApps(json: unknown): Slug[] | InputProblem {
  const problem = {
    error:
      "turbo ls --affected printed JSON robkit can't read. Name the apps to deploy with --apps, or deploy them all with --all.",
  };
  const packages = isRecord(json) ? json.packages : undefined;
  const items = isRecord(packages) ? packages.items : undefined;
  if (!Array.isArray(items)) return problem;
  const slugs: Slug[] = [];
  for (const item of items) {
    const path = isRecord(item) ? item.path : undefined;
    if (typeof path !== "string") return problem;
    if (!path.startsWith("apps/")) continue;
    const slug = readSlug(path.slice("apps/".length));
    if (!isProblem(slug)) slugs.push(slug);
  }
  return slugs;
}
