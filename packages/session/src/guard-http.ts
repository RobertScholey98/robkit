import type { SessionCookies } from "./session-cookies.ts";

/**
 * The page the browser asked for: the app's own origin, from its settings,
 * plus the request's path and query. Nothing in the request decides the
 * origin, so a proxy hop that rewrites Host or X-Forwarded-Proto changes
 * nothing.
 */
export function publicUrl(request: Request, origin: string): URL {
  const { pathname, search } = new URL(request.url);
  return new URL(`${origin}${pathname}${search}`);
}

/**
 * The `next` a request names, if it is a page on the same app. A page under
 * the guard's own paths isn't one.
 */
export function nextOn(url: URL): string | undefined {
  const next = url.searchParams.get("next");
  if (next === null || !URL.canParse(next)) return undefined;
  const target = new URL(next);
  return target.origin === url.origin &&
    !target.pathname.startsWith("/_robkit/")
    ? target.href
    : undefined;
}

/**
 * A page load can follow a redirect to the hub or core. A fetch from the
 * page, or a server calling the app, can't, so it gets 401 and the place to
 * send the browser. Without fetch metadata, only a request that accepts HTML
 * counts as a page load.
 */
export function isNavigation(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const mode = request.headers.get("sec-fetch-mode");
  if (mode !== null) return mode === "navigate";
  return request.headers.get("accept")?.includes("text/html") ?? false;
}

/**
 * A page load by a browser that says so, which keeps cookies and so can go
 * through core and come back. A client without fetch metadata, such as a
 * server or a link preview, might not, and would bounce for ever.
 */
export function isBrowserNavigation(request: Request): boolean {
  return (
    (request.method === "GET" || request.method === "HEAD") &&
    request.headers.get("sec-fetch-mode") === "navigate"
  );
}

/** A plain-text answer that no cache keeps. */
export function text(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=UTF-8",
      "cache-control": "no-store",
    },
  });
}

/** A redirect that no cache keeps, with any extra headers. */
export function redirect(
  location: string,
  headers: [string, string][] = [],
): Response {
  return new Response(null, {
    status: 302,
    headers: [
      ["cache-control", "no-store"],
      ["location", location],
      ...headers,
    ],
  });
}

/**
 * A `Set-Cookie` value for a host-only cookie on the app's own subdomain,
 * with no `Domain`, set as `sessionCookies` says.
 */
export function hostOnlyCookie(
  name: string,
  value: string,
  maxAge: number,
  { path, sameSite, secure }: SessionCookies["attributes"],
): string {
  return [
    `${name}=${value}`,
    `Path=${path}`,
    `Max-Age=${String(maxAge)}`,
    "HttpOnly",
    `SameSite=${sameSite}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}
