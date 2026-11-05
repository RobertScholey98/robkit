// Where an install's apps answer. Each app, the platform apps included, is
// on `<slug>.<domain>`, so one domain gives every address. Core, the guard,
// the hub, admin, the dev runner and the whole-stack test all work their
// addresses out here. It imports nothing, so the browser can load it.

/** Core, the hub and admin. Core's app catalog doesn't list them. */
export const platformApps = ["core", "hub", "admin"] as const;

/** Whether `slug` is a platform app rather than one of the owner's apps. */
export function isPlatformApp(slug: string): boolean {
  return (platformApps as readonly string[]).includes(slug);
}

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
  host(slug: string): string;
  /** An app's origin, such as `https://notes.robkit.dev`. */
  origin(slug: string): string;
  /**
   * `url`, if it is an http(s) URL on one of the install's subdomains, such
   * as the `next` an app's guard sends the browser away with.
   */
  onInstall(url: string | undefined): string | undefined;
  /**
   * The slug of the app `url` is on, if it is an http(s) URL on
   * `<slug>.<domain>` with one label before the domain.
   */
  appOf(url: string | URL): string | undefined;
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
      const slug = target.hostname.slice(0, -suffix.length);
      return slug !== "" && !slug.includes(".") ? slug : undefined;
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
  return install({
    domain,
    protocol: at.protocol === "https:" ? "https" : "http",
    port: at.port === "" ? undefined : Number(at.port),
  });
}

function isWeb(url: URL): boolean {
  return url.protocol === "https:" || url.protocol === "http:";
}
