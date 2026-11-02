import { readAccessRule, type AccessRule } from "@robkit/guard";
import { loopbackFetch } from "./loopback-fetch.ts";

/** How long an app keeps its rule before asking core again. */
const accessRuleMaxAgeMs = 60_000;

export interface CoreAccessOptions {
  /** The clock, in milliseconds, that times the cache. */
  now?: () => number;
}

/**
 * The app's access rule as the owner set it in admin, fetched from core
 * and kept for a minute, so a change reaches the app within one. A failed
 * load throws, and the next call tries again.
 *
 * @param coreOrigin core's public origin, such as `http://core.robkit.localhost:3000`
 * @param slug the app's slug, which is also its subdomain
 */
export function coreAccess(
  coreOrigin: string,
  slug: string,
  { now = Date.now }: CoreAccessOptions = {},
): () => Promise<AccessRule> {
  const url = new URL(`/apps/${encodeURIComponent(slug)}/access`, coreOrigin);
  let cached: { rule: AccessRule; until: number } | undefined;
  let pending: Promise<AccessRule> | undefined;

  const load = async (): Promise<AccessRule> => {
    const res = await loopbackFetch(url.href, {
      method: "GET",
      headers: new Headers({ accept: "application/json" }),
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404) {
      throw new Error(`Core doesn't know an app called ${slug}.`);
    }
    if (!res.ok) {
      throw new Error(
        `Core answered ${String(res.status)} for ${slug}'s access rule.`,
      );
    }
    const rule = readAccessRule(await res.json().catch(() => undefined));
    if (!rule) {
      throw new Error(`Core sent an access rule for ${slug} that isn't one.`);
    }
    cached = { rule, until: now() + accessRuleMaxAgeMs };
    return rule;
  };

  return () => {
    if (cached && now() < cached.until) return Promise.resolve(cached.rule);
    pending ??= load().finally(() => {
      pending = undefined;
    });
    return pending;
  };
}
