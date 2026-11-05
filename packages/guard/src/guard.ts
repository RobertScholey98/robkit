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

/**
 * What the app knows of who is asking, once the adapter has checked its
 * cookie: core said nobody is signed in, the app's token has expired, it
 * holds a live token, or it holds nothing from core yet and must ask.
 */
export type SessionState =
  | { state: "unknown" }
  | { state: "signed-out" }
  | { state: "expired" }
  | { state: "signed-in"; viewer: SignedInViewer };

export type Decision =
  | { outcome: "allow"; viewer: Viewer }
  | { outcome: "login" }
  | { outcome: "refresh" }
  | { outcome: "not-found" };

type Outcome = Decision["outcome"];

/** Who is asking, as far as the rule cares. A guest in the rule holds one of its roles. */
type Asking =
  "unknown" | "signed-out" | "expired" | "owner" | "guest" | "guest-in-rule";

const outcomes: Record<AccessRule["kind"], Record<Asking, Outcome>> = {
  open: {
    unknown: "refresh",
    "signed-out": "allow",
    expired: "refresh",
    owner: "allow",
    guest: "allow",
    "guest-in-rule": "allow",
  },
  roles: {
    unknown: "refresh",
    "signed-out": "login",
    expired: "refresh",
    owner: "allow",
    guest: "not-found",
    "guest-in-rule": "allow",
  },
  owner: {
    unknown: "refresh",
    "signed-out": "login",
    expired: "refresh",
    owner: "allow",
    guest: "not-found",
    "guest-in-rule": "not-found",
  },
};

function askingOf(rule: AccessRule, session: SessionState): Asking {
  if (session.state !== "signed-in") return session.state;
  const { viewer } = session;
  if (viewer.kind === "owner") return "owner";
  const inRule =
    rule.kind === "roles" &&
    rule.roles.some((role) => viewer.roles.includes(role));
  return inRule ? "guest-in-rule" : "guest";
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

/** Reads an access rule sent as JSON, or undefined if it isn't one. */
export function readAccessRule(value: unknown): AccessRule | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const kind = "kind" in value ? value.kind : undefined;
  const roles = "roles" in value ? value.roles : undefined;
  if (kind === "open" || kind === "owner") return { kind };
  const isRoleList =
    Array.isArray(roles) && roles.every((role) => typeof role === "string");
  return kind === "roles" && isRoleList ? { kind, roles } : undefined;
}
