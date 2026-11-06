/** The URL the browser asked for, as it saw it in front of the proxy. */
export function publicUrl(request: Request): URL {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto === "https" || proto === "http") url.protocol = `${proto}:`;
  return url;
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
