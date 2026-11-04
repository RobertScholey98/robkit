/** What a call to core comes to: the answer it read, or a sentence to show. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Turns core's JSON into a value, or undefined if it can't. */
export type Reader<T> = (body: unknown) => T | undefined;

export interface CallOptions<T> {
  /** Posted as JSON. */
  body?: object;
  read?: Reader<T>;
}

/**
 * Calls core at `core` with the viewer's cookie. A failed call answers with
 * core's `{ error }` sentence, or one saying what went wrong instead.
 */
export function callCore(
  core: string,
  method: "GET" | "POST",
  path: string,
  options?: { body?: object },
): Promise<Result<undefined>>;
export function callCore<T>(
  core: string,
  method: "GET" | "POST",
  path: string,
  options: { body?: object; read: Reader<T> },
): Promise<Result<T>>;
export async function callCore<T>(
  core: string,
  method: "GET" | "POST",
  path: string,
  { body, read }: CallOptions<T> = {},
): Promise<Result<T | undefined>> {
  let res: Response;
  try {
    res = await fetch(`${core}${path}`, {
      method,
      credentials: "include",
      // The JSON content type makes the browser preflight every POST, which
      // core answers only for the hub and admin, so another site can't post
      // to core with the viewer's cookie.
      ...(method === "POST" && {
        headers: { "content-type": "application/json" },
      }),
      ...(body && { body: JSON.stringify(body) }),
    });
  } catch {
    return { ok: false, error: `Couldn't reach core at ${core}.` };
  }
  const answer: unknown =
    res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (!res.ok) {
    const error =
      isRecord(answer) && typeof answer.error === "string"
        ? answer.error
        : `Core answered ${String(res.status)}.`;
    return { ok: false, error };
  }
  if (!read) return { ok: true, value: undefined };
  const value = read(answer);
  return value === undefined
    ? { ok: false, error: "Core sent an answer this page can't read." }
    : { ok: true, value };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Reads a list whose every item `read` accepts. */
export function listOf<T>(value: unknown, read: Reader<T>): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map(read);
  return items.every((item) => item !== undefined) ? items : undefined;
}
