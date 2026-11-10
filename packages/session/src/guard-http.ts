import { appRefreshPath } from "./app-session.ts";
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

/** Whether `target` is a page on the app at `origin`, not under the guard's own paths. */
function isPageOn(target: URL, origin: string): boolean {
  return target.origin === origin && !target.pathname.startsWith("/_robkit/");
}

/**
 * The `next` a request names, if it is a page on the same app. A page under
 * the guard's own paths isn't one.
 */
export function nextOn(url: URL): string | undefined {
  const next = url.searchParams.get("next");
  if (next === null || !URL.canParse(next)) return undefined;
  const target = new URL(next);
  return isPageOn(target, url.origin) ? target.href : undefined;
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

/** A GET whose `Upgrade` is `websocket`, in any case. */
function isWebSocketHandshake(request: Request): boolean {
  return (
    request.method === "GET" &&
    request.headers.get("upgrade")?.toLowerCase() === "websocket"
  );
}

/**
 * Whether the guard refuses `request` as coming from another origin than
 * the app's own, `origin`. A browser sends an app's cookie with a form
 * posted from a sibling subdomain, so the cookie alone doesn't say the
 * viewer meant it.
 *
 * GET, HEAD and OPTIONS pass. Every other method is a write. A browser
 * can't forge `Sec-Fetch-Site`, so when a write carries it, only
 * `same-origin` and `none` pass, whatever `Origin` says. Without it,
 * `Origin` decides: absent or the app's own passes. A WebSocket handshake
 * is judged by `Origin` alone, because browsers disagree on the fetch
 * metadata they send with one.
 */
export function isFromAnotherOrigin(request: Request, origin: string): boolean {
  const from = request.headers.get("origin");
  const elsewhere = from !== null && from !== origin;
  if (isWebSocketHandshake(request)) return elsewhere;
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return false;
  const site = request.headers.get("sec-fetch-site");
  if (site !== null) return site !== "same-origin" && site !== "none";
  return elsewhere;
}

/**
 * A form the browser posted as a page load. It can't follow the guard to
 * core and back with its body, so it gets a page instead.
 */
export function isFormPost(request: Request): boolean {
  return (
    request.method === "POST" &&
    request.headers.get("sec-fetch-mode") === "navigate"
  );
}

/**
 * The characters a URL may hold, as a browser writes one, other than a
 * quote. A `Referer` with any other isn't one a browser sent, and the two
 * ports would read it differently.
 */
const urlCharacters = /^[\w\-.~:/?#[\]@!$&()*+,;=%]+$/;

/** `text` with the characters HTML gives a meaning escaped. */
function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&#34;")
    .replaceAll("'", "&#39;");
}

/**
 * The page for a form the guard didn't take because it must first check
 * who sent it, with the status the guard's 401 for a call has. Its one link
 * goes through the app's refresh path, which asks core, back to the page
 * the form was on: the `Referer`, when it is a page on the app at
 * `origin`, and the app's `/` otherwise.
 */
export function formNotSent(request: Request, origin: string): Response {
  const referer = request.headers.get("referer") ?? "";
  const from =
    urlCharacters.test(referer) && URL.canParse(referer)
      ? new URL(referer)
      : undefined;
  const link = new URL(appRefreshPath, origin);
  link.searchParams.set(
    "next",
    from && isPageOn(from, origin) ? from.href : `${origin}/`,
  );
  const page = [
    "<!doctype html>",
    '<html lang="en">',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Your form wasn't sent</title>",
    "<h1>Your form wasn't sent</h1>",
    "<p>The app needs to check who you are first. Go back to the page, then send the form again.</p>",
    `<p><a href="${escapeHtml(link.href)}">Back to the page</a></p>`,
    "",
  ].join("\n");
  return new Response(page, {
    status: 401,
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "no-store",
    },
  });
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
