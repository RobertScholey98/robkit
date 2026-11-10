import {
  readCodeId,
  readRoleId,
  type CodeId,
  type RoleId,
  type Viewer,
} from "@robkit/guard";
import {
  orThrow,
  readCoreUrl,
  readDomain,
  readSlug,
  type CoreOrigin,
  type Domain,
  type Slug,
} from "@robkit/input";

// A test builds a branded value as the code does, with its reader.
// robkit/no-brand-cast refuses a cast to one, tests included.

/** `name` as an app's slug. Throws the reader's problem if it isn't one. */
export function slug(name: string): Slug {
  return orThrow(readSlug(name));
}

/**
 * `name` as an install's domain, `robkit.localhost` unless it says. Throws
 * the reader's problem if it isn't one.
 */
export function aDomain(name = "robkit.localhost"): Domain {
  return orThrow(readDomain({ ROBKIT_DOMAIN: name }));
}

/**
 * `url` as core's public origin, `http://core.robkit.localhost:3000`
 * unless it says. Throws the reader's problem if it isn't one.
 */
export function aCoreOrigin(
  url = "http://core.robkit.localhost:3000",
): CoreOrigin {
  return orThrow(readCoreUrl({ ROBKIT_CORE_URL: url }));
}

/** `id` as a code id. Throws the guard's problem if it isn't one. */
export function aCodeId(id = "code-1"): CodeId {
  return orThrow(readCodeId(id));
}

/** `id` as a role id. Throws the guard's problem if it isn't one. */
export function aRoleId(id: string): RoleId {
  return orThrow(readRoleId(id));
}

/** Who `aViewer` builds: a guest's code id is `code-1` unless it says. */
export type ViewerOptions =
  | { kind: "owner"; id?: string }
  | { kind: "guest"; id?: string; roles?: readonly string[] }
  | { kind: "nobody" };

/** A viewer as the guard hands one to an app's handlers. */
export function aViewer(options: ViewerOptions): Viewer {
  switch (options.kind) {
    case "owner":
      return { kind: "owner", id: options.id ?? "owner-1" };
    case "guest":
      return {
        kind: "guest",
        id: aCodeId(options.id),
        roles: (options.roles ?? []).map(aRoleId),
      };
    case "nobody":
      return { kind: "nobody" };
  }
}
