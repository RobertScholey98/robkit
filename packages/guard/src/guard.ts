import { isProblem, isRecord, type InputProblem, problem } from "@robkit/input";

declare const roleIdBrand: unique symbol;
declare const codeIdBrand: unique symbol;

/**
 * A role's id, as core stores it. Only a reader makes one: `readRoleId`,
 * `readAccessRule`, and core's, which check it more closely.
 */
export type RoleId = string & { readonly [roleIdBrand]: true };

/**
 * An access code's id, which names a guest. Apps see it, never the code
 * itself. Only a reader makes one: `readCodeId`, and core's.
 */
export type CodeId = string & { readonly [codeIdBrand]: true };

function isRoleId(value: unknown): value is RoleId {
  return typeof value === "string" && value !== "";
}

function isCodeId(value: unknown): value is CodeId {
  return typeof value === "string" && value !== "";
}

/** `value` as a problem shows it. */
function shown(value: unknown): string {
  return value === undefined ? "Nothing" : JSON.stringify(value);
}

/** `value` as a role id, if it is a string that isn't empty. */
export function readRoleId(value: unknown): RoleId | InputProblem {
  if (isRoleId(value)) return value;
  return problem(
    `${shown(value)} isn't a role's id, which is text that isn't empty.`,
  );
}

/** `value` as a code id, if it is a string that isn't empty. */
export function readCodeId(value: unknown): CodeId | InputProblem {
  if (isCodeId(value)) return value;
  return problem(
    `${shown(value)} isn't an access code's id, which is text that isn't empty.`,
  );
}

/** `value` as a list of role ids. */
export function readRoleIds(value: unknown): RoleId[] | InputProblem {
  const wrong = problem(
    `${shown(value)} isn't a list of role ids, each text that isn't empty.`,
  );
  if (!Array.isArray(value)) return wrong;
  const roles: RoleId[] = [];
  for (const item of value) {
    const role = readRoleId(item);
    if (isProblem(role)) return wrong;
    roles.push(role);
  }
  return roles;
}

/**
 * Who may open an app: anyone, guests holding one of some roles (by id),
 * or only the owner. The owner may open every app.
 */
export type AccessRule =
  { kind: "open" } | { kind: "roles"; roles: RoleId[] } | { kind: "owner" };

/** The owner, with a live session. */
export interface OwnerViewer {
  kind: "owner";
  id: string;
}

/** A guest with a live session, by their code's id, and their roles' ids. */
export interface GuestViewer {
  kind: "guest";
  id: CodeId;
  roles: RoleId[];
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

/** Reads an access rule sent as JSON. */
export function readAccessRule(value: unknown): AccessRule | InputProblem {
  const wrong = problem(
    `${shown(value)} isn't an access rule. Use {"kind": "open"}, {"kind": "owner"}, or {"kind": "roles", "roles": [...]} listing role ids.`,
  );
  if (!isRecord(value)) return wrong;
  const { kind } = value;
  if (kind === "open" || kind === "owner") return { kind };
  const roles = readRoleIds(value.roles);
  return kind === "roles" && !isProblem(roles) ? { kind, roles } : wrong;
}
