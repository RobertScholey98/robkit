// What core's tokens say about a session's holder, and when they change.
// No database: sessions.ts reads and writes the rows, and asks these.

import type { CodeId, RoleId, SignedInViewer } from "@robkit/guard";
import type { ReadSessionToken, SessionTokenClaims } from "@robkit/session";

/** A session lasts 30 days from sign-in. */
export const sessionLifetimeSeconds = 30 * 24 * 60 * 60;

/** When a session started at `now` expires. */
export function sessionExpiry(now: Date): Date {
  return new Date(now.getTime() + sessionLifetimeSeconds * 1000);
}

/** Who holds a session, as its tokens name them: a guest's roles, by id. */
export interface Holder {
  viewer: { kind: "owner"; id: string } | { kind: "guest"; id: CodeId };
  roles: RoleId[];
}

/** The holder as an app's guard sees them. */
export function guardViewerOf({ viewer, roles }: Holder): SignedInViewer {
  return viewer.kind === "owner"
    ? { kind: viewer.kind, id: viewer.id }
    : { kind: viewer.kind, id: viewer.id, roles };
}

/** What core's own token for the holder's session `sessionId` says. */
export function claimsFor(
  { viewer, roles }: Holder,
  sessionId: string,
): SessionTokenClaims {
  return viewer.kind === "owner"
    ? { kind: viewer.kind, id: viewer.id, sessionId }
    : { kind: viewer.kind, id: viewer.id, sessionId, roles };
}

function sameRoles(a: readonly RoleId[], b: readonly RoleId[]): boolean {
  return a.length === b.length && a.every((role, i) => role === b[i]);
}

/**
 * Whether core mints a fresh token for a live session whose token says
 * `claims`: when the token has expired, when asked to `renew`, or when a
 * guest's roles have changed, so the apps they open agree with the launcher
 * core lists for them.
 */
export function needsFreshToken(
  claims: ReadSessionToken,
  holder: Holder,
  renew: boolean,
): boolean {
  const rolesChanged =
    claims.kind === "guest" && !sameRoles(claims.roles, holder.roles);
  return claims.expired || renew || rolesChanged;
}
