// robkit's readers for what comes from outside its own code: environment
// variables and JSON. Each takes the raw input and returns the typed value
// or an InputProblem that names the variable or key and says what to do.
// The caller decides what a problem means: core and the dev runner refuse
// to start, a command prints it. See docs/conventions/input.md.

import { installAt, readSlug, type Slug } from "./install-addresses.ts";
import {
  allProblems,
  isProblem,
  isRecord,
  type InputProblem,
} from "./problem.ts";

export { allProblems, isProblem, isRecord, type InputProblem };

/** A process's environment, such as `process.env`. */
export type Env = Readonly<Record<string, string | undefined>>;

/** A variable's value, with an empty one counting as unset. */
function valueOf(env: Env, name: string): string | undefined {
  const value = env[name];
  return value === "" ? undefined : value;
}

const notSet = (name: string, fix: string): InputProblem => ({
  error: `${name} is not set. ${fix}`,
});

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
  return {
    error: `${name} is "${value}", which isn't a port. Set it to a whole number from 1 to 65535${unset}.`,
  };
}

/** The address to listen on: `HOST`, or loopback. */
export function readHost(env: Env): string | InputProblem {
  const value = valueOf(env, "HOST");
  if (value === undefined) return "127.0.0.1";
  if (/^[\w.:-]+$/.test(value) && !value.includes("//")) return value;
  return {
    error: `HOST is "${value}", which isn't an address to listen on. Set it to an IP address or host name, such as 0.0.0.0, or leave it unset for 127.0.0.1.`,
  };
}

const label = "[a-z0-9]([a-z0-9-]*[a-z0-9])?";
const domainPattern = new RegExp(`^${label}(\\.${label})*$`, "i");

/** Whether `value` is a domain alone, with no scheme, port or path. */
export function isDomain(value: string): boolean {
  return domainPattern.test(value);
}

/** The install's domain: `ROBKIT_DOMAIN`, or `fallback`. */
export function readDomain(env: Env, fallback?: string): string | InputProblem {
  const value = valueOf(env, "ROBKIT_DOMAIN");
  if (value === undefined) {
    return (
      fallback ??
      notSet(
        "ROBKIT_DOMAIN",
        "Set it to the install's domain, such as robkit.dev.",
      )
    );
  }
  if (isDomain(value)) return value;
  return {
    error: `ROBKIT_DOMAIN is "${value}", which isn't a domain. Set it to the install's domain alone, such as robkit.dev, with no scheme, port or path.`,
  };
}

/** Core's public origin, `ROBKIT_CORE_URL`, which an app's guard asks. */
export function readCoreUrl(env: Env): string | InputProblem {
  const value = valueOf(env, "ROBKIT_CORE_URL");
  if (value === undefined) {
    return notSet(
      "ROBKIT_CORE_URL",
      "Run the app with pnpm dev, which sets it, or set it to core's public origin, such as https://core.robkit.dev.",
    );
  }
  if (installAt(value, "core")) return value;
  return {
    error: `ROBKIT_CORE_URL is "${value}", which isn't core's address. Set it to core's public origin, such as https://core.robkit.dev.`,
  };
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
  return isProblem(slug) ? { error: `ROBKIT_APP: ${slug.error}` } : slug;
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
  return {
    error: `${name} isn't a postgres:// URL. Set it to one, such as postgres://user:password@host:5432/database.`,
  };
}

/** `text` parsed as JSON, or a problem naming `source`. */
export function parseJson(
  text: string,
  source: string,
): { json: unknown } | InputProblem {
  try {
    return { json: JSON.parse(text) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { error: `${source} isn't valid JSON (${reason}). Fix its syntax.` };
  }
}
