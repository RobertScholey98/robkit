import {
  readCodeId,
  readRoleId,
  type CodeId,
  type RoleId,
  type Viewer,
} from "@robkit/guard";
import { known } from "./known.ts";

// A test builds a branded value as the code does, with the guard's reader.
// robkit/no-brand-cast refuses a cast to one, tests included.

/** `id` as a code id. Throws if the guard wouldn't read it as one. */
export function aCodeId(id = "code-1"): CodeId {
  return known(readCodeId(id), `A code id from "${id}"`);
}

/** `id` as a role id. Throws if the guard wouldn't read it as one. */
export function aRoleId(id: string): RoleId {
  return known(readRoleId(id), `A role id from "${id}"`);
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
