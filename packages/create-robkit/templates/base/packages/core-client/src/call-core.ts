import { type InputProblem, isProblem, isRecord } from "@robkit/input";

/** What a call to core comes to: the answer it read, or a sentence to show. */
export type Result<T> =
  { outcome: "ok"; value: T } | { outcome: "failed"; error: string };

/**
 * Reads core's JSON into a value, or says why it can't. Its problem goes to
 * the log, not to the person, so it names the field, not what core sent.
 */
export type Reader<T> = (body: unknown) => T | InputProblem;

/**
 * Told what went wrong underneath a failed call, such as to log it: what
 * the call was doing, and the error it hit, if there is one.
 */
export type Report = (message: string, cause?: unknown) => void;

/** The default `report`: prints the message, then the cause on its own. */
export const reportToConsole: Report = (message, cause) => {
  console.error(message);
  if (cause !== undefined) console.error(cause);
};

/** A reader's problem, saying what's wrong with core's answer. */
export function problem(error: string): InputProblem {
  return { error };
}

export interface CallOptions<T> {
  /** Posted as JSON. */
  body?: object;
  read?: Reader<T>;
  report?: Report;
}

/** How long a call waits for core before giving up. */
const timeoutSeconds = 10;

/** What the person sees when core's answer won't read. */
const unreadable = "Core sent an answer this page can't read.";

/**
 * Calls core at `core` with the viewer's cookie. A failed call answers with
 * core's `{ error }` sentence, or one saying what went wrong instead, and
 * tells `report` what went wrong underneath, never with what core sent.
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
  { body, read, report = reportToConsole }: CallOptions<T> = {},
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
    report(
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
  const answered = `Core at ${core} answered ${method} ${path} with ${String(res.status)}`;
  let answer: unknown;
  let json = true;
  try {
    answer = text === "" ? undefined : JSON.parse(text);
  } catch {
    // Not JSON, such as a proxy's error page. JSON.parse's error quotes the
    // answer, so it stays out of the report; the status or the reader says
    // what that means to the person.
    json = false;
    report(`${answered} and something that isn't JSON.`);
  }
  if (!res.ok) return failure(res, answer);
  if (!read) return { outcome: "ok", value: undefined };
  if (!json) return { outcome: "failed", error: unreadable };
  const value = read(answer);
  if (isProblem(value)) {
    report(`${answered}, which this page can't read: ${value.error}`);
    return { outcome: "failed", error: unreadable };
  }
  return { outcome: "ok", value };
}

/** A failed status's result: core's `{ error }` sentence, or the status. */
function failure(res: Response, answer: unknown): Result<never> {
  return {
    outcome: "failed",
    error:
      isRecord(answer) && typeof answer.error === "string"
        ? answer.error
        : `Core answered ${String(res.status)}.`,
  };
}

/** Reads `value`, core's `field` field, as a list whose every item `read` accepts. */
export function listOf<T>(
  value: unknown,
  field: string,
  read: Reader<T>,
): T[] | InputProblem {
  if (!Array.isArray(value)) return problem(`The ${field} field isn't a list.`);
  const items: T[] = [];
  for (const [index, item] of value.entries()) {
    const itemValue = read(item);
    if (isProblem(itemValue)) {
      return problem(
        `Item ${String(index + 1)} of the ${field} field: ${itemValue.error}`,
      );
    }
    items.push(itemValue);
  }
  return items;
}
