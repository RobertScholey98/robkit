import { callCore, isRecord, type Result } from "@internal/core-client";

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
  | { state: "signed-in"; viewer: Profile };

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
  return result.ok ? { ok: true, value: { state: "signed-out" } } : result;
}

function readSession(body: unknown): Session | undefined {
  if (!isRecord(body)) return undefined;
  const { state, viewer } = body;
  if (state === "unclaimed" || state === "signed-out") return { state };
  if (state !== "signed-in" || !isRecord(viewer)) return undefined;
  const { kind, id, username, name } = viewer;
  if (typeof id !== "string") return undefined;
  if (kind === "owner" && typeof username === "string") {
    return { state, viewer: { kind, id, username } };
  }
  if (kind === "guest" && typeof name === "string") {
    return { state, viewer: { kind, id, name } };
  }
  return undefined;
}
