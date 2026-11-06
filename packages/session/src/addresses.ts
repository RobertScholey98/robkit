// Where an install's apps answer. Each app, the platform apps included, is
// on `<slug>.<domain>`, so one domain gives every address. Core, the guard,
// the hub, admin, the dev runner and the whole-stack test all work their
// addresses out here. It imports only @robkit/input, which imports nothing,
// so the browser can load it.

import { isProblem, readSlug, type CoreOrigin, type Slug } from "@robkit/input";

/**
 * Whether the install runs on `localhost` or a name under it, which only
 * ever means development. A local install's cookies go without `Secure`:
 * browsers treat *.localhost as a secure context, but WebKit drops Secure
 * cookies over plain http.
 */
export function isLocal(domain: string): boolean {
  return domain === "localhost" || domain.endsWith(".localhost");
}

/** The domain an install answers on when `ROBKIT_DOMAIN` isn't set. */
export const defaultDomain = "robkit.localhost";

/** The port `pnpm dev`'s proxy listens on when `ROBKIT_DEV_PORT` isn't set. */
export const defaultDevPort = 3000;

/** An install's addresses, worked out from its domain. */
export interface Install {
  /** The domain every app is a subdomain of, such as `robkit.dev`. */
  readonly domain: string;
  /** An app's host name, such as `notes.robkit.dev`. */
  host(slug: Slug): string;
  /** An app's origin, such as `https://notes.robkit.dev`. */
  origin(slug: Slug): string;
  /**
   * `url`, if it is an http(s) URL on one of the install's subdomains, such
   * as the `next` an app's guard sends the browser away with.
   */
  onInstall(url: string | undefined): string | undefined;
  /**
   * The slug of the app `url` is on, if it is an http(s) URL on
   * `<slug>.<domain>` with one label before the domain, and that label is a
   * slug.
   */
  appOf(url: string | URL): Slug | undefined;
}

export interface InstallOptions {
  domain: string;
  /** Defaults to `http`. */
  protocol?: "http" | "https";
  /** Leave it out, or give the protocol's own, for no port in the origins. */
  port?: number | undefined;
}

/** The install on `domain`, served over `protocol` on `port`. */
export function install({
  domain,
  protocol = "http",
  port,
}: InstallOptions): Install {
  const portPart = port === undefined ? "" : `:${String(port)}`;
  return {
    domain,
    host: (slug) => `${slug}.${domain}`,
    origin: (slug) =>
      new URL(`${protocol}://${slug}.${domain}${portPart}`).origin,
    onInstall(url) {
      if (url === undefined || !URL.canParse(url)) return undefined;
      const target = new URL(url);
      return isWeb(target) && target.hostname.endsWith(`.${domain}`)
        ? target.href
        : undefined;
    },
    appOf(url) {
      if (!URL.canParse(url)) return undefined;
      const target = new URL(url);
      const suffix = `.${domain}`;
      if (!isWeb(target) || !target.hostname.endsWith(suffix)) return undefined;
      const slug = readSlug(target.hostname.slice(0, -suffix.length));
      return isProblem(slug) ? undefined : slug;
    },
  };
}

/**
 * The install that `url` is on, given that it is `app`'s address, such as
 * core's public origin or a page on the hub. Undefined if `url` isn't an
 * http(s) URL on `<app>.<domain>`.
 */
export function installAt(url: string | URL, app: string): Install | undefined {
  if (!URL.canParse(url)) return undefined;
  const at = new URL(url);
  const label = `${app}.`;
  const domain = at.hostname.slice(label.length);
  if (!isWeb(at) || !at.hostname.startsWith(label) || domain === "") {
    return undefined;
  }
  return installOn(at, domain);
}

/**
 * The install core is on. `readCoreUrl` checked that the origin is on
 * `core.<domain>`, so there is always one.
 */
export function coreInstall(core: CoreOrigin): Install {
  const at = new URL(core);
  return installOn(at, at.hostname.slice("core.".length));
}

/** The install on `domain`, served the way `url` is. */
function installOn(url: URL, domain: string): Install {
  return install({
    domain,
    protocol: url.protocol === "https:" ? "https" : "http",
    port: url.port === "" ? undefined : Number(url.port),
  });
}

function isWeb(url: URL): boolean {
  return url.protocol === "https:" || url.protocol === "http:";
}
