// Readers for environment variables. Each takes the environment and returns
// the typed value or an InputProblem that names the variable and says what
// to do. The caller decides what a problem means: core and the dev runner
// refuse to start, a command prints it. See docs/conventions/input.md.

import { isProblem, problem, type InputProblem } from "./problem.ts";
import { readSlug, type Slug } from "./slug.ts";

/** A process's environment, such as `process.env`. */
export type Env = Readonly<Record<string, string | undefined>>;

/** A variable's value, with an empty one counting as unset. */
function valueOf(env: Env, name: string): string | undefined {
  const value = env[name];
  return value === "" ? undefined : value;
}

const notSet = (name: string, fix: string): InputProblem =>
  problem(`${name} is not set. ${fix}`);

/** A variable that must be set, or what to do when it isn't. */
export function readSet(
  env: Env,
  name: string,
  fix: string,
): string | InputProblem {
  return valueOf(env, name) ?? notSet(name, fix);
}

/** A port, a whole number from 1 to 65535, from `name`, or `fallback`. */
export function readPort(
  env: Env,
  name = "PORT",
  fallback?: number,
): number | InputProblem {
  const value = valueOf(env, name);
  if (value === undefined) {
    return (
      fallback ??
      notSet(
        name,
        "Set it to the port to listen on, a whole number from 1 to 65535.",
      )
    );
  }
  const port = /^\d{1,5}$/.test(value) ? Number(value) : 0;
  if (port >= 1 && port <= 65535) return port;
  const unset =
    fallback === undefined ? "" : `, or leave it unset for ${String(fallback)}`;
  return problem(
    `${name} is "${value}", which isn't a port. Set it to a whole number from 1 to 65535${unset}.`,
  );
}

const octet = String.raw`(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)`;
const ipv4Pattern = new RegExp(String.raw`^${octet}(?:\.${octet}){3}$`);

/** Whether `value` is an IPv4 address in dotted decimal, such as 0.0.0.0. */
function isIPv4(value: string): boolean {
  return ipv4Pattern.test(value);
}

/**
 * Whether `value` is an IPv6 address as Node listens on one: without
 * brackets or a zone, such as `::` or `2001:db8::1`. The URL parser checks
 * the rest.
 */
function isIPv6(value: string): boolean {
  return (
    value.includes(":") &&
    /^[\da-f:.]+$/i.test(value) &&
    URL.canParse(`http://[${value}]`)
  );
}

/**
 * The address to listen on: `HOST`, or loopback. It may be an IPv4 or IPv6
 * address, or a host name.
 */
export function readHost(env: Env): string | InputProblem {
  const value = valueOf(env, "HOST");
  if (value === undefined) return "127.0.0.1";
  if (isIPv4(value) || isIPv6(value) || isDomain(value)) return value;
  return problem(
    `HOST is "${value}", which isn't an address to listen on. Set it to an IP address or host name, such as 0.0.0.0, or leave it unset for 127.0.0.1.`,
  );
}

// A label is 1 to 63 letters, digits and hyphens, with no hyphen at either
// end. A name is labels joined by single dots, 253 characters at most.
const label = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const domainPattern = new RegExp(String.raw`^${label}(?:\.${label})*$`, "i");

declare const domainBrand: unique symbol;

/**
 * A domain alone, with no scheme, port or path, such as `robkit.dev`. Only
 * `readDomain` makes one.
 */
export type Domain = string & { readonly [domainBrand]: true };

/**
 * Whether `value` is a domain alone, with no scheme, port or path: a host
 * name whose last label isn't all digits, so an IP address, or something like
 * one, isn't a name. With `readDomain`, the only maker of a `Domain`.
 */
export function isDomain(value: string): value is Domain {
  const last = value.slice(value.lastIndexOf(".") + 1);
  return (
    value.length <= 253 && domainPattern.test(value) && !/^\d+$/.test(last)
  );
}

/**
 * The install's domain: `ROBKIT_DOMAIN`, or `fallback`, checked the same
 * way. It is lower-cased, as a browser and the URL parser write a host, so
 * `Robkit.dev` compares equal to every host name read from a URL.
 */
export function readDomain(env: Env, fallback?: string): Domain | InputProblem {
  const value = valueOf(env, "ROBKIT_DOMAIN") ?? fallback;
  if (value === undefined) {
    return notSet(
      "ROBKIT_DOMAIN",
      "Set it to the install's domain, such as robkit.dev.",
    );
  }
  const domain = value.toLowerCase();
  if (isDomain(domain)) return domain;
  return problem(
    `ROBKIT_DOMAIN is "${value}", which isn't a domain. Set it to the install's domain alone, such as robkit.dev, with no scheme, port or path.`,
  );
}

/**
 * Whether the install runs on `localhost` or a name under it, which only
 * ever means development. Only a local install may run over plain http. A
 * local install's cookies go without `Secure`: browsers treat *.localhost
 * as a secure context, but WebKit drops Secure cookies over plain http.
 */
export function isLocal(domain: string): boolean {
  return domain === "localhost" || domain.endsWith(".localhost");
}

declare const coreOriginBrand: unique symbol;

/**
 * Core's public origin, an http(s) origin on `core.<domain>`, such as
 * `https://core.robkit.dev`. Only `readCoreUrl` makes one.
 */
export type CoreOrigin = string & { readonly [coreOriginBrand]: true };

function isCoreOrigin(value: string): value is CoreOrigin {
  if (!URL.canParse(value)) return false;
  const { protocol, hostname, origin } = new URL(value);
  return (
    (protocol === "https:" || protocol === "http:") &&
    origin === value &&
    hostname.startsWith("core.") &&
    isDomain(hostname.slice("core.".length))
  );
}

/**
 * Core's public origin, `ROBKIT_CORE_URL`, which an app's guard asks. A
 * path after the origin is dropped, and the URL parser lower-cases the
 * host. It is https unless the install is local, since tokens travel in
 * the URLs of an install's redirects.
 */
export function readCoreUrl(env: Env): CoreOrigin | InputProblem {
  const value = valueOf(env, "ROBKIT_CORE_URL");
  if (value === undefined) {
    return notSet(
      "ROBKIT_CORE_URL",
      "Run the app with pnpm dev, which sets it, or set it to core's public origin, such as https://core.robkit.dev.",
    );
  }
  const origin = URL.canParse(value) ? new URL(value).origin : value;
  if (isCoreOrigin(origin)) {
    const { protocol, hostname } = new URL(origin);
    if (protocol === "https:" || isLocal(hostname)) return origin;
    return problem(
      `ROBKIT_CORE_URL is "${value}", which is http on a domain that isn't local. Serve the install over https and set it to ${origin.replace(/^http:/, "https:")}.`,
    );
  }
  return problem(
    `ROBKIT_CORE_URL is "${value}", which isn't core's address. Set it to core's public origin, such as https://core.robkit.dev.`,
  );
}

/** The app's own slug, `ROBKIT_APP`. */
export function readAppSlug(env: Env): Slug | InputProblem {
  const value = valueOf(env, "ROBKIT_APP");
  if (value === undefined) {
    return notSet(
      "ROBKIT_APP",
      "Run the app with pnpm dev, which sets it to the app's slug.",
    );
  }
  const slug = readSlug(value);
  return isProblem(slug) ? problem(`ROBKIT_APP: ${slug.error}`) : slug;
}

/**
 * A Postgres URL from `name`. A problem never shows the value, which may
 * hold a password.
 */
export function readDatabaseUrl(
  env: Env,
  name = "DATABASE_URL",
  unsetFix = "Run the app with pnpm dev, which sets it, or set it to a postgres:// URL.",
): string | InputProblem {
  const value = valueOf(env, name);
  if (value === undefined) return notSet(name, unsetFix);
  const protocol = URL.canParse(value) ? new URL(value).protocol : "";
  if (protocol === "postgres:" || protocol === "postgresql:") return value;
  return problem(
    `${name} isn't a postgres:// URL. Set it to one, such as postgres://user:password@host:5432/database.`,
  );
}
