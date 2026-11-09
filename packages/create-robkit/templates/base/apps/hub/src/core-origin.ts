import type { Slug } from "@robkit/input";
import { type Install, installAt } from "@robkit/input/addresses";

/**
 * The install the hub's page is on. The hub answers on `hub.<domain>`, so it
 * finds core and every app from its own address and needs no config.
 */
function installOf(page: string | URL): Install {
  const install = installAt(page, "hub");
  if (!install) {
    throw new Error(
      `The hub must be served from hub.<domain>, not ${new URL(page).host}`,
    );
  }
  return install;
}

/** Core's origin: `core.<domain>`, beside the hub. */
export function coreOrigin(page: string | URL): string {
  return installOf(page).origin("core");
}

/**
 * Where to send the browser after it signs in: the `next` URL an app's guard
 * put on the hub's address, if it is on an app's own origin on this
 * install, with the hub's protocol and port.
 */
export function returnTo(page: string | URL): string | undefined {
  const next = new URL(page).searchParams.get("next");
  if (next === null || !installOf(page).appAt(next)) return undefined;
  return new URL(next).href;
}

/** An app's origin: `<slug>.<domain>`, beside the hub. */
export function appOrigin(page: string | URL, slug: Slug): string {
  return installOf(page).origin(slug);
}
