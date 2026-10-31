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
