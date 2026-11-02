/** What a robkit adapter answers a call with once the session has lapsed. */
interface SessionLapsed {
  error: string;
  /** Where the browser goes: core's refresh, or the hub to log in. */
  location: string;
}

/** The header the guard sets on its 401, naming login or refresh. */
const guardHeader = "robkit-session";

async function lapsed(response: Response): Promise<SessionLapsed | undefined> {
  if (response.status !== 401 || !response.headers.has(guardHeader)) {
    return undefined;
  }
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => undefined);
  if (typeof body !== "object" || body === null) return undefined;
  const { error, location } = body as Record<string, unknown>;
  if (typeof error !== "string" || typeof location !== "string") {
    return undefined;
  }
  return URL.canParse(location) ? { error, location } : undefined;
}

let leaving = false;

/** Sends the browser on once, however many calls found the session lapsed. */
function leaveFor({ location }: SessionLapsed): void {
  if (leaving) return;
  leaving = true;
  // A page the browser brings back from its cache can leave again.
  addEventListener("pageshow", (event) => {
    if (event.persisted) leaving = false;
  });
  // The adapter only knows the URL it was called on. Come back to the page.
  const target = new URL(location);
  target.searchParams.set("next", globalThis.location.href);
  globalThis.location.assign(target.href);
}

/**
 * `fetch` for calls from the page to its own app, such as Start's server
 * functions. When the guard says the session has lapsed, it sends the
 * browser through core's refresh, or to the hub to log in, and back to this
 * page. That call never settles, since the page is leaving, so callers
 * don't show an error for it. Every other answer, errors included, goes to
 * the caller untouched.
 */
export const sessionFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const elsewhere = await lapsed(response);
  if (!elsewhere) return response;
  leaveFor(elsewhere);
  return new Promise<never>(() => undefined);
};
