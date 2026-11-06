import { CommandProblem } from "@robkit/dev/cli";
import { isRecord } from "@robkit/input";

// The Coolify API as robkit deploy calls it: one request with its deadline,
// and what to check when Coolify, or something in front of it, refuses.

/** How to reach Coolify's API. */
export interface Coolify {
  url: string;
  token: string;
  /** A Cloudflare Access service token, when Access guards Coolify. */
  accessId?: string;
  accessSecret?: string;
}

/** Coolify's API as one deploy reaches it. */
export interface CoolifyApi {
  coolify: Coolify;
  fetch: typeof fetch;
  /** How long one request may take before the deploy gives up on it. */
  requestTimeoutMs: number;
}

/** A call's answer, or what went wrong and what to check. */
type CoolifyAnswer =
  { ok: true; body: unknown } | { ok: false; detail: string; check: string };

export const whatToCheck = {
  reach: "Check COOLIFY_URL and that Coolify is up.",
  token: "Check COOLIFY_TOKEN, and that it may deploy.",
  access:
    "Check CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET: Cloudflare Access sends a token it refuses to its login page.",
  page: "Check that COOLIFY_URL is Coolify's own address.",
  coolify: "Check Coolify's own log.",
  deployment: "Check the deployment's log in Coolify.",
} as const;

/** What to check when Coolify answers `status`. */
function checkForStatus(status: number): string {
  if (status >= 300 && status < 400) return whatToCheck.access;
  if (status === 401 || status === 403) return whatToCheck.token;
  return whatToCheck.coolify;
}

/** A failed call as one sentence and what to check. */
export function describeFailure(called: {
  detail: string;
  check: string;
}): string {
  return `${called.detail}. ${called.check}`;
}

export function describeDuration(ms: number): string {
  if (ms < 1000) return `${String(ms)} ms`;
  if (ms < 60_000) return `${String(Math.round(ms / 1000))} seconds`;
  return `${String(Math.round(ms / 60_000))} minutes`;
}

export function fieldOf(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

export function stringFieldOf(value: unknown, key: string): string | undefined {
  const found = fieldOf(value, key);
  return typeof found === "string" ? found : undefined;
}

function describeError(error: unknown): string {
  const { message, cause } =
    error instanceof Error ? error : new Error(String(error));
  return cause instanceof Error ? `${message}, ${cause.message}` : message;
}

/**
 * Calls the Coolify API. A redirect counts as a failure, because Cloudflare
 * Access answers a rejected service token with a redirect to its login page.
 * Each call gives up after `api.requestTimeoutMs`, or when `deadline`
 * aborts, whichever comes first.
 */
export async function callCoolify(
  api: CoolifyApi,
  method: string,
  path: string,
  { body, deadline }: { body?: unknown; deadline?: AbortSignal } = {},
): Promise<CoolifyAnswer> {
  const { coolify } = api;
  const base = coolify.url.replace(/\/+$/, "");
  const timeout = AbortSignal.timeout(api.requestTimeoutMs);
  try {
    const response = await api.fetch(`${base}/api/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${coolify.token}`,
        Accept: "application/json",
        ...(coolify.accessId &&
          coolify.accessSecret && {
            "CF-Access-Client-Id": coolify.accessId,
            "CF-Access-Client-Secret": coolify.accessSecret,
          }),
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
      redirect: "manual",
      signal: deadline ? AbortSignal.any([timeout, deadline]) : timeout,
    });
    const raw = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        detail: `HTTP ${String(response.status)} ${raw}`,
        check: checkForStatus(response.status),
      };
    }
    try {
      const body: unknown = JSON.parse(raw);
      return { ok: true, body };
    } catch {
      // A body that isn't JSON comes from something in front of Coolify,
      // and the parser's own message adds nothing.
      return {
        ok: false,
        detail: `HTTP ${String(response.status)} with a body that isn't JSON`,
        check: whatToCheck.page,
      };
    }
  } catch (error) {
    const detail = timeout.aborted
      ? `no answer in ${describeDuration(api.requestTimeoutMs)}`
      : describeError(error);
    return { ok: false, detail, check: whatToCheck.reach };
  }
}

export async function readFromCoolify(
  api: CoolifyApi,
  path: string,
): Promise<unknown> {
  const result = await callCoolify(api, "GET", path);
  if (!result.ok) {
    throw new CommandProblem(
      `Couldn't read Coolify's ${path.slice(1)}: ${describeFailure(result)}`,
    );
  }
  return result.body;
}
