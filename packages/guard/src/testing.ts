import { orThrow, problem } from "@robkit/input";
import {
  readCodeId,
  readRoleId,
  type GuestViewer,
  type OwnerViewer,
} from "./guard.ts";

// Viewers for an app's tests, built with the guard's own readers, so a test
// never casts to a branded id. Each adapter's /testing entry gives these.

/** The owner, `owner-1` unless it says. */
export function owner(id = "owner-1"): OwnerViewer {
  return {
    kind: "owner",
    id: orThrow(
      id === ""
        ? problem(`"" isn't the owner's id, which is text that isn't empty.`)
        : id,
    ),
  };
}

/** Who `guest` builds: their code's id, `code-1` unless it says, and roles. */
export interface GuestOptions {
  id?: string;
  /** The roles' ids, none unless it says. */
  roles?: readonly string[];
}

/** A guest holding `roles`, by the ids an app's access rule names. */
export function guest({
  id = "code-1",
  roles = [],
}: GuestOptions = {}): GuestViewer {
  return {
    kind: "guest",
    id: orThrow(readCodeId(id)),
    roles: roles.map((role) => orThrow(readRoleId(role))),
  };
}

/** Nobody signed in, as an app open to anyone sees them. */
export function nobody(): { kind: "nobody" } {
  return { kind: "nobody" };
}
