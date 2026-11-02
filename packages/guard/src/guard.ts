/**
 * Who may open an app: anyone, guests holding one of some roles (by id),
 * or only the owner. The owner may open every app.
 */
export type AccessRule =
  { kind: "open" } | { kind: "roles"; roles: string[] } | { kind: "owner" };

/** The owner, with a live session. */
export interface OwnerViewer {
  kind: "owner";
  id: string;
}

/** A guest with a live session, by their code's id, and their roles' ids. */
export interface GuestViewer {
  kind: "guest";
  id: string;
  roles: string[];
}

/** Someone with a live session. */
export type SignedInViewer = OwnerViewer | GuestViewer;

/** Who is asking, as the app's handlers see it after the guard. */
export type Viewer = SignedInViewer | { kind: "nobody" };

/** What the request's session token says, once the adapter has checked it. */
export type SessionState =
  | { state: "signed-out" }
  | { state: "expired" }
  | { state: "signed-in"; viewer: SignedInViewer };

export type Decision =
  | { outcome: "allow"; viewer: Viewer }
  | { outcome: "login" }
  | { outcome: "refresh" }
  | { outcome: "not-found" };

type Outcome = Decision["outcome"];

/** Who is asking, as far as the rule cares. A member holds one of its roles. */
type Asking = "signed-out" | "expired" | "owner" | "guest" | "member";

const outcomes: Record<AccessRule["kind"], Record<Asking, Outcome>> = {
  open: {
    "signed-out": "allow",
    expired: "refresh",
    owner: "allow",
    guest: "allow",
    member: "allow",
  },
  roles: {
    "signed-out": "login",
    expired: "refresh",
    owner: "allow",
    guest: "not-found",
    member: "allow",
  },
  owner: {
    "signed-out": "login",
    expired: "refresh",
    owner: "allow",
    guest: "not-found",
    member: "not-found",
  },
};

function askingOf(rule: AccessRule, session: SessionState): Asking {
  if (session.state !== "signed-in") return session.state;
  const { viewer } = session;
  if (viewer.kind === "owner") return "owner";
  const isMember =
    rule.kind === "roles" &&
    rule.roles.some((role) => viewer.roles.includes(role));
  return isMember ? "member" : "guest";
}

/** Decides what an app does with a request, from its rule and the session. */
export function guard(rule: AccessRule, session: SessionState): Decision {
  const outcome = outcomes[rule.kind][askingOf(rule, session)];
  if (outcome !== "allow") return { outcome };
  return {
    outcome,
    viewer: session.state === "signed-in" ? session.viewer : { kind: "nobody" },
  };
}
