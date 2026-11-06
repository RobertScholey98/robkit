/** What a call to core comes to: the answer it read, or a sentence to show. */
export type Result<T> =
  { outcome: "ok"; value: T } | { outcome: "failed"; error: string };

/** Turns core's JSON into a value, or undefined if it can't. */
export type Reader<T> = (body: unknown) => T | undefined;

/**
 * Told what went wrong underneath a failed call, such as to log it: what
 * the call was doing, and the error it hit.
 */
export type Report = (message: string, cause: unknown) => void;

export interface CallOptions<T> {
  /** Posted as JSON. */
  body?: object;
  read?: Reader<T>;
  report?: Report;
}

/** How long a call waits for core before giving up. */
const timeoutSeconds = 10;

/**
 * Calls core at `core` with the viewer's cookie. A failed call answers with
 * core's `{ error }` sentence, or one saying what went wrong instead.
 */
export function callCore(
  core: string,
  method: "GET" | "POST",
  path: string,
  options?: { body?: object; report?: Report },
): Promise<Result<undefined>>;
export function callCore<T>(
  core: string,
  method: "GET" | "POST",
  path: string,
  options: { body?: object; read: Reader<T>; report?: Report },
): Promise<Result<T>>;
export async function callCore<T>(
  core: string,
  method: "GET" | "POST",
  path: string,
  { body, read, report }: CallOptions<T> = {},
): Promise<Result<T | undefined>> {
  // One deadline covers the answer's headers and its body.
  let res: Response;
  let text: string;
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
      signal: AbortSignal.timeout(timeoutSeconds * 1000),
    });
    text = await res.text();
  } catch (error) {
    const timedOut =
      error instanceof DOMException && error.name === "TimeoutError";
    report?.(
      timedOut
        ? `Core at ${core} didn't answer ${method} ${path} in ${String(timeoutSeconds)} seconds.`
        : `Couldn't reach core at ${core} for ${method} ${path}.`,
      error,
    );
    return {
      outcome: "failed",
      error: timedOut
        ? `Core at ${core} didn't answer in ${String(timeoutSeconds)} seconds. Try again.`
        : `Couldn't reach core at ${core}.`,
    };
  }
  let answer: unknown;
  try {
    answer = text === "" ? undefined : JSON.parse(text);
  } catch (error) {
    // Not JSON, such as a proxy's error page. The status or the reader
    // says what that means to the person; report keeps the detail.
    report?.(
      `Core at ${core} answered ${method} ${path} with something that isn't JSON.`,
      error,
    );
  }
  if (!res.ok) {
    const error =
      isRecord(answer) && typeof answer.error === "string"
        ? answer.error
        : `Core answered ${String(res.status)}.`;
    return { outcome: "failed", error };
  }
  if (!read) return { outcome: "ok", value: undefined };
  const value = read(answer);
  return value === undefined
    ? { outcome: "failed", error: "Core sent an answer this page can't read." }
    : { outcome: "ok", value };
}

/**
 * Whether `value` is a plain object: not `null`, and not an array. It means
 * what `isRecord` from `@robkit/input` does, and a robkit test
 * checks the two agree.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads a list whose every item `read` accepts. */
export function listOf<T>(value: unknown, read: Reader<T>): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map(read);
  return items.every((item) => item !== undefined) ? items : undefined;
}
