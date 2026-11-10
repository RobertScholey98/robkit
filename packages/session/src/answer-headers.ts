/**
 * HSTS's value on an https install: a year, for the host that sends it
 * alone. robkit refuses plain http off a local domain, so an https install
 * stays https. No `includeSubDomains`, since the domain may hold hosts
 * robkit doesn't run.
 */
export const strictTransportSecurity = "max-age=31536000";

/** Who may frame an answer: pages on its own origin, or nobody. */
export type Framers = "same-origin" | "none";

/** The framing headers for each of `Framers`. */
const framing: Record<Framers, [string, string][]> = {
  "same-origin": [["x-frame-options", "SAMEORIGIN"]],
  none: [
    ["x-frame-options", "DENY"],
    ["content-security-policy", "frame-ancestors 'none'"],
  ],
};

/** The statuses a browser follows to another address. */
const redirects = new Set([301, 302, 303, 307, 308]);

/** Whether `status` sends the browser on to another address. */
export function isRedirect(status: number): boolean {
  return redirects.has(status);
}

/**
 * The headers robkit puts on an answer from `origin`: `nosniff` always,
 * HSTS when `origin` is https, and who may frame it, as `framers` says. A
 * redirect renders nothing, so it gets no framing header, and an app that
 * lets a framer in can go through the guard's, core's and the callback's
 * redirects inside the frame. Pass `undefined` for one.
 *
 * Pages on the same origin is `X-Frame-Options: SAMEORIGIN`, which an
 * app's own `frame-ancestors` overrides. Nobody is `DENY` and
 * `frame-ancestors 'none'`, for core.
 */
export function securityHeaders(
  origin: string,
  framers: Framers | undefined,
): [string, string][] {
  const transport: [string, string][] =
    new URL(origin).protocol === "https:"
      ? [["strict-transport-security", strictTransportSecurity]]
      : [];
  return [
    ...(framers ? framing[framers] : []),
    ["x-content-type-options", "nosniff"],
    ...transport,
  ];
}

/**
 * `response` with each of `headers` it lacks. A header the app set stays as
 * the app set it. An answer whose headers can't change, such as one from
 * `Response.redirect()` or passed on from `fetch`, is copied first, so this
 * never throws on one.
 */
export function withHeaders(
  response: Response,
  headers: readonly [string, string][],
): Response {
  const missing = headers.filter(([name]) => !response.headers.has(name));
  if (missing.length === 0) return response;
  const copy = new Response(response.body, response);
  for (const [name, value] of missing) copy.headers.set(name, value);
  return copy;
}
