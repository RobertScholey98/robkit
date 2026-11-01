/** Who may open an app: anyone, or only the owner. */
export type AccessRule = { kind: "open" } | { kind: "owner" };

/** Someone with a live session: the owner, or a guest by their code's id. */
export interface SignedInViewer {
  kind: "owner" | "guest";
  id: string;
}

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
type Asking = "signed-out" | "expired" | SignedInViewer["kind"];

const outcomes: Record<AccessRule["kind"], Record<Asking, Outcome>> = {
  open: {
    "signed-out": "allow",
    expired: "refresh",
    owner: "allow",
    guest: "allow",
  },
  owner: {
    "signed-out": "login",
    expired: "refresh",
    owner: "allow",
    guest: "not-found",
  },
};

function askingOf(session: SessionState): Asking {
  return session.state === "signed-in" ? session.viewer.kind : session.state;
}

/** Decides what an app does with a request, from its rule and the session. */
export function guard(rule: AccessRule, session: SessionState): Decision {
  const outcome = outcomes[rule.kind][askingOf(session)];
  if (outcome !== "allow") return { outcome };
  return {
    outcome,
    viewer: session.state === "signed-in" ? session.viewer : { kind: "nobody" },
  };
}
