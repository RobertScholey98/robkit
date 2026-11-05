// The guard's answer to a call whose session has lapsed, and how the page
// reads it. requestGuard writes it and @robkit/react's sessionFetch reads it,
// so both take it from here. It imports nothing, so the browser can load it.

/** The header that marks the guard's 401, naming where the browser goes. */
export const sessionLapsedHeader = "robkit-session";

/** What the guard tells a call whose session has lapsed. */
export interface SessionLapsed {
  /** Log in at the hub, or get the app a new token through core. */
  outcome: "login" | "refresh";
  error: string;
  /** Where the browser goes. The page adds `next`, since it knows itself. */
  location: string;
}

/** The guard's 401 for a call, as opposed to a page load, it turned away. */
export function sessionLapsedResponse({
  outcome,
  error,
  location,
}: SessionLapsed): Response {
  return Response.json(
    { error, location },
    {
      status: 401,
      headers: { "cache-control": "no-store", [sessionLapsedHeader]: outcome },
    },
  );
}

/**
 * What the guard said, if `response` is its 401. An app's own 401 is not,
 * even when shaped like the guard's. It reads a clone, so the caller can
 * still read the body.
 */
export async function readSessionLapsed(
  response: Response,
): Promise<SessionLapsed | undefined> {
  const outcome = response.headers.get(sessionLapsedHeader);
  if (response.status !== 401) return undefined;
  if (outcome !== "login" && outcome !== "refresh") return undefined;
  // A body that isn't JSON isn't the guard's 401, so the caller gets it.
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => undefined);
  if (typeof body !== "object" || body === null) return undefined;
  const { error, location } = body as Record<string, unknown>;
  if (typeof error !== "string" || typeof location !== "string") {
    return undefined;
  }
  return URL.canParse(location) ? { outcome, error, location } : undefined;
}
