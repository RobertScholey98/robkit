import { isProblem } from "@robkit/input";
import { readAccessRule, type AccessRule } from "@robkit/guard";
import { coreFetch } from "./loopback-fetch.ts";

/** How long an app keeps its rule before asking core again. */
const accessRuleMaxAgeMs = 60_000;

/**
 * How core's answer failed to give the app's access rule: core doesn't know
 * the app, it answered with an error or with something that isn't a rule,
 * its body isn't JSON, or the body broke off before its end.
 */
export type AccessRuleFailure =
  "unknown-app" | "bad-answer" | "invalid-json" | "interrupted-body";

/** Core answered, but not with the app's access rule. */
export class AccessRuleError extends Error {
  override name = "AccessRuleError";
  /** Which way it failed. */
  readonly failure: AccessRuleFailure;

  constructor(
    failure: AccessRuleFailure,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.failure = failure;
  }
}

export interface CoreAccessOptions {
  /** The clock, in milliseconds, that times the cache. */
  now?: () => number;
}

/**
 * The app's access rule as the owner set it in admin, fetched from core
 * and kept for a minute, so a change reaches the app within one. A failed
 * load throws, and the next call tries again: an {@link AccessRuleError}
 * when core answered, and a `CoreUnreachableError` when it didn't.
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
  const answerFor = `Core's answer for ${slug}'s access rule`;
  let cached: { rule: AccessRule; until: number } | undefined;
  let pending: Promise<AccessRule> | undefined;

  const load = async (): Promise<AccessRule> => {
    const res = await coreFetch(url.href, {
      method: "GET",
      headers: new Headers({ accept: "application/json" }),
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404) {
      throw new AccessRuleError(
        "unknown-app",
        `Core doesn't know an app called ${slug}.`,
      );
    }
    if (!res.ok) {
      throw new AccessRuleError(
        "bad-answer",
        `Core answered ${String(res.status)} for ${slug}'s access rule.`,
      );
    }
    let body: string;
    try {
      body = await res.text();
    } catch (error) {
      throw new AccessRuleError(
        "interrupted-body",
        `${answerFor} broke off before its end.`,
        { cause: error },
      );
    }
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch (error) {
      throw new AccessRuleError("invalid-json", `${answerFor} isn't JSON.`, {
        cause: error,
      });
    }
    const rule = readAccessRule(json);
    if (isProblem(rule)) {
      throw new AccessRuleError(
        "bad-answer",
        `Core sent an access rule for ${slug} that isn't one.`,
        { cause: rule },
      );
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
