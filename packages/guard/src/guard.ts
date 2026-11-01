/** Who may open an app: anyone, or only the owner. */
export type AccessRule = { kind: "open" } | { kind: "owner" };

/** Who is asking, as the app's handlers see it after the guard. */
export type Viewer = { kind: "owner"; id: string } | { kind: "nobody" };

/** What the request's session token says, once the adapter has checked it. */
export type SessionState =
  | { state: "signed-out" }
  | { state: "expired" }
  | { state: "signed-in"; viewer: { kind: "owner"; id: string } };

export type Decision =
  | { outcome: "allow"; viewer: Viewer }
  | { outcome: "login" }
  | { outcome: "refresh" }
  | { outcome: "not-found" };

type Outcome = Decision["outcome"];
type Asking = "signed-out" | "expired" | "owner";

const outcomes: Record<AccessRule["kind"], Record<Asking, Outcome>> = {
  open: { "signed-out": "allow", expired: "refresh", owner: "allow" },
  owner: { "signed-out": "login", expired: "refresh", owner: "allow" },
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
