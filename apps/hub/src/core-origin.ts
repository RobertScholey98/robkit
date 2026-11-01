/**
 * Core answers on `core.<domain>` beside the hub on `hub.<domain>`, so the
 * hub finds it from its own address and needs no config.
 */
export function coreOrigin(page: string | URL): string {
  const url = new URL(page);
  if (!url.hostname.startsWith("hub.")) {
    throw new Error(
      `The hub must be served from hub.<domain>, not ${url.host}`,
    );
  }
  url.hostname = `core.${url.hostname.slice("hub.".length)}`;
  return url.origin;
}

/**
 * Where to send the browser after it signs in: the `next` URL an app's guard
 * put on the hub's address, if it is on one of the install's subdomains.
 */
export function returnTo(page: string | URL): string | undefined {
  const url = new URL(page);
  const next = url.searchParams.get("next");
  if (next === null || !URL.canParse(next)) return undefined;
  const target = new URL(next);
  const domain = url.hostname.slice("hub.".length);
  const web = target.protocol === "https:" || target.protocol === "http:";
  return web && target.hostname.endsWith(`.${domain}`)
    ? target.href
    : undefined;
}
