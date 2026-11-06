import { installAt, type Install, type Slug } from "@robkit/session/addresses";

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
 * put on the hub's address, if it is on one of the install's subdomains.
 */
export function returnTo(page: string | URL): string | undefined {
  const next = new URL(page).searchParams.get("next") ?? undefined;
  return installOf(page).onInstall(next);
}

/** An app's origin: `<slug>.<domain>`, beside the hub. */
export function appOrigin(page: string | URL, slug: Slug): string {
  return installOf(page).origin(slug);
}
