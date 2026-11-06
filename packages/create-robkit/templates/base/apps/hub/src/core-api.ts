import { callCore, problem, type Result } from "@internal/core-client";
import { type InputProblem, isRecord } from "@robkit/input";

export interface Owner {
  kind: "owner";
  id: string;
  username: string;
}

/** A guest, by their access code's id, and the name the owner gave them. */
export interface Guest {
  kind: "guest";
  id: string;
  name: string;
}

export type Profile = Owner | Guest;

export type Session =
  | { state: "unclaimed" }
  | { state: "signed-out" }
  | { state: "signed-in"; profile: Profile };

export interface Credentials {
  username: string;
  password: string;
}

export function getSession(core: string): Promise<Result<Session>> {
  return callCore(core, "GET", "/session", { read: readSession });
}

export function setUp(
  core: string,
  credentials: Credentials,
): Promise<Result<Session>> {
  return callCore(core, "POST", "/setup", {
    body: credentials,
    read: readSession,
  });
}

export function signIn(
  core: string,
  credentials: Credentials,
): Promise<Result<Session>> {
  return callCore(core, "POST", "/login", {
    body: credentials,
    read: readSession,
  });
}

export function signInWithCode(
  core: string,
  code: string,
): Promise<Result<Session>> {
  return callCore(core, "POST", "/login/code", {
    body: { code },
    read: readSession,
  });
}

export async function signOut(core: string): Promise<Result<Session>> {
  const result = await callCore(core, "POST", "/logout");
  return result.outcome === "ok"
    ? { outcome: "ok", value: { state: "signed-out" } }
    : result;
}

function readSession(body: unknown): Session | InputProblem {
  if (!isRecord(body)) return problem("The session isn't an object.");
  const { state, profile } = body;
  if (state === "unclaimed" || state === "signed-out") return { state };
  if (state !== "signed-in") {
    return problem(
      "The session's state isn't unclaimed, signed-out or signed-in.",
    );
  }
  if (!isRecord(profile))
    return problem("The session's profile isn't an object.");
  const { kind, id, username, name } = profile;
  if (typeof id !== "string") return problem("The profile's id isn't text.");
  if (kind === "owner" && typeof username === "string") {
    return { state, profile: { kind, id, username } };
  }
  if (kind === "guest" && typeof name === "string") {
    return { state, profile: { kind, id, name } };
  }
  return problem(
    "The profile isn't an owner with a username or a guest with a name.",
  );
}
