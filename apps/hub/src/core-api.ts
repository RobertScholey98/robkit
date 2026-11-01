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

export type Viewer = Owner | Guest;

export type Session =
  | { state: "unclaimed" }
  | { state: "signed-out" }
  | { state: "signed-in"; viewer: Viewer };

export type CoreResult =
  { ok: true; session: Session } | { ok: false; error: string };

export interface Credentials {
  username: string;
  password: string;
}

export function getSession(core: string): Promise<CoreResult> {
  return request(core, "/session", { method: "GET" }, readSession);
}

export function setUp(
  core: string,
  credentials: Credentials,
): Promise<CoreResult> {
  return request(core, "/setup", post(credentials), readSession);
}

export function signIn(
  core: string,
  credentials: Credentials,
): Promise<CoreResult> {
  return request(core, "/login", post(credentials), readSession);
}

export function signInWithCode(
  core: string,
  code: string,
): Promise<CoreResult> {
  return request(core, "/login/code", post({ code }), readSession);
}

export function signOut(core: string): Promise<CoreResult> {
  return request(core, "/logout", post(), () => ({ state: "signed-out" }));
}

// The JSON content type also makes the browser preflight every POST, so
// another site can't post a form to core with the owner's cookie.
function post(body?: object): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body && { body: JSON.stringify(body) }),
  };
}

async function request(
  core: string,
  path: string,
  init: RequestInit,
  read: (body: unknown) => Session | undefined,
): Promise<CoreResult> {
  let res: Response;
  try {
    res = await fetch(`${core}${path}`, { ...init, credentials: "include" });
  } catch {
    return { ok: false, error: `Couldn't reach core at ${core}.` };
  }

  const body: unknown =
    res.status === 204 ? undefined : await res.json().catch(() => undefined);

  if (!res.ok) {
    return {
      ok: false,
      error: readError(body) ?? `Core answered ${String(res.status)}.`,
    };
  }
  const session = read(body);
  return session
    ? { ok: true, session }
    : { ok: false, error: "Core sent an answer the hub can't read." };
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

function readError(body: unknown): string | undefined {
  return isRecord(body) && typeof body.error === "string"
    ? body.error
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
