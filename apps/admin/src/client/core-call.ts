export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

// The JSON content type makes the browser preflight every POST, which core
// answers only for the hub and admin.
export function post(body?: object): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body && { body: JSON.stringify(body) }),
  };
}

/** Calls core with the owner's cookie, answering with the body it sent. */
export async function call(
  core: string,
  path: string,
  init: RequestInit,
): Promise<Result<unknown>> {
  let res: Response;
  try {
    res = await fetch(`${core}${path}`, { ...init, credentials: "include" });
  } catch {
    return { ok: false, error: `Couldn't reach core at ${core}.` };
  }
  const body: unknown =
    res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (res.ok) return { ok: true, value: body };
  const error =
    isRecord(body) && typeof body.error === "string"
      ? body.error
      : `Core answered ${String(res.status)}.`;
  return { ok: false, error };
}

export function readWith<T>(
  result: Result<unknown>,
  read: (body: unknown) => T | undefined,
): Result<T> {
  if (!result.ok) return result;
  const value = read(result.value);
  return value === undefined
    ? { ok: false, error: "Core sent an answer admin can't read." }
    : { ok: true, value };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
