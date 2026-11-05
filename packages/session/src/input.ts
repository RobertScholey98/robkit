// robkit's readers for what comes from outside its own code: environment
// variables, JSON files, and the `robkit` field of an app's manifest. Each
// takes the raw input and returns the typed value or a InputProblem that names the
// variable or key and says what to do. The caller decides what a problem
// means: core and the dev runner refuse to start, a command prints it. See
// docs/conventions/input.md.

import { readAccessRule } from "@robkit/guard";
import { installAt, readSlug, type Slug } from "./install-addresses.ts";

/** Why some input won't do: where it is, what's wrong, and what to do. */
export interface InputProblem {
  readonly error: string;
}

export function isProblem(value: unknown): value is InputProblem {
  return isRecord(value) && typeof value.error === "string";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every problem among `reads` as one, a line each. */
export function allProblems(...reads: unknown[]): InputProblem {
  return {
    error: reads
      .filter(isProblem)
      .map((problem) => problem.error)
      .join("\n"),
  };
}

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
  return typeof slug === "string"
    ? slug
    : { error: `ROBKIT_APP: ${slug.error}` };
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

/** Where a server listens: `HOST` and `PORT`, by default 127.0.0.1:3000. */
export function readServeEnv(
  env: Env,
): { host: string; port: number } | InputProblem {
  const host = readHost(env);
  const port = readPort(env, "PORT", 3000);
  if (isProblem(host) || isProblem(port)) {
    return allProblems(host, port);
  }
  return { host, port };
}

/**
 * What `pnpm dev` hands an app's Vite dev server, each when it's set: the
 * port to listen on, and the domain its host is under.
 */
export function readDevServerEnv(
  env: Env,
): { port?: number; domain?: string } | InputProblem {
  const port = valueOf(env, "PORT") === undefined ? undefined : readPort(env);
  const domain =
    valueOf(env, "ROBKIT_DOMAIN") === undefined ? undefined : readDomain(env);
  if (isProblem(port) || isProblem(domain)) return allProblems(port, domain);
  return {
    ...(port !== undefined && { port }),
    ...(domain !== undefined && { domain }),
  };
}

/** What an app's guard needs: its slug and core's public origin. */
export function readGuardEnv(
  env: Env,
): { app: Slug; core: string } | InputProblem {
  const app = readAppSlug(env);
  const core = readCoreUrl(env);
  if (isProblem(app) || isProblem(core)) {
    return allProblems(app, core);
  }
  return { app, core };
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

/**
 * Who may open an app, as its manifest declares it. A rule's roles are
 * named, not ids, so this isn't the guard's `AccessRule`: core finds or
 * creates each role by name when it adds the app.
 */
export type DeclaredAccess =
  { kind: "open" } | { kind: "owner" } | { kind: "roles"; roleNames: string[] };

/** What an app's manifest declares in its `robkit` field, for core's catalog. */
export interface Declares {
  /** Who may open the app once core adds it. Owner-only if left out. */
  access?: DeclaredAccess;
  /** An emoji the launcher shows. */
  icon?: string;
}

/** An app as the install declares it to core, in `ROBKIT_APPS`. */
export interface DeclaredApp extends Declares {
  slug: Slug;
}

function readDeclaredAccess(value: unknown): DeclaredAccess | undefined {
  const rule = readAccessRule(value);
  if (rule?.kind !== "roles") return rule;
  const roleNames = rule.roles;
  return roleNames.length > 0 && roleNames.every((name) => name !== "")
    ? { kind: "roles", roleNames }
    : undefined;
}

/**
 * What an app declares, from its manifest's `robkit` field. `field` is
 * where the value sits, which each problem names.
 */
export function readDeclares(
  value: unknown,
  field = "robkit",
): Declares | InputProblem {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    return {
      error: `${field} must be an object, such as {"access": {"kind": "open"}, "icon": "📝"}, or left out.`,
    };
  }
  const declares: Declares = {};
  if (value.access !== undefined) {
    const access = readDeclaredAccess(value.access);
    if (!access) {
      return {
        error: `${field}.access must be {"kind": "open"}, {"kind": "owner"}, or {"kind": "roles", "roles": ["Family"]} naming at least one role.`,
      };
    }
    declares.access = access;
  }
  if (value.icon !== undefined) {
    const { icon } = value;
    if (typeof icon !== "string" || icon === "" || icon.length > 16) {
      return { error: `${field}.icon must be one emoji, such as "📝".` };
    }
    declares.icon = icon;
  }
  return declares;
}

/** What an app declares, as its manifest and `ROBKIT_APPS` write it. */
export function declaresJson({
  access,
  icon,
}: Declares): Record<string, unknown> {
  return {
    ...(access && {
      access:
        access.kind === "roles"
          ? { kind: "roles", roles: access.roleNames }
          : { kind: access.kind },
    }),
    ...(icon !== undefined && { icon }),
  };
}

/** One app in `ROBKIT_APPS`, whose place `field` names. */
export function readDeclaredApp(
  value: unknown,
  field: string,
): DeclaredApp | InputProblem {
  if (!isRecord(value)) {
    return {
      error: `${field} must be an object with the app's slug, such as {"slug": "notes"}.`,
    };
  }
  const slug = readSlug(value.slug);
  if (typeof slug !== "string") {
    return { error: `${field}.slug: ${slug.error}` };
  }
  const declares = readDeclares(value, field);
  return isProblem(declares) ? declares : { slug, ...declares };
}
