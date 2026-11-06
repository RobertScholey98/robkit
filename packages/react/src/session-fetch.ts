import { readSessionLapsed, type SessionLapsed } from "@robkit/session/lapsed";

let leaving = false;

/** Sends the browser on once, however many calls found the session lapsed. */
function leaveFor({ location }: SessionLapsed): void {
  if (leaving) return;
  leaving = true;
  // A page the browser brings back from its cache can leave again.
  addEventListener("pageshow", (event) => {
    if (event.persisted) leaving = false;
  });
  // The guard leaves next to the page, which knows where to come back to.
  const target = new URL(location);
  target.searchParams.set("next", globalThis.location.href);
  globalThis.location.assign(target.href);
}

/** How long a call waits for the app's answer, its body included. */
const timeoutMs = 30_000;

/**
 * `fetch` for calls from the page to its own app, such as Start's server
 * functions. When the guard says the app's token has lapsed, it sends the
 * browser through the app's refresh path and core for a new one, or to the
 * hub to log in, and back to this page. That call never settles, since the
 * page is leaving, so callers don't show an error for it. Every other
 * answer, errors included, goes to the caller untouched.
 *
 * A call that gets no answer, or whose body stalls, fails with a
 * `TimeoutError` after 30 seconds. The caller's own signal still stops it
 * sooner.
 */
export const sessionFetch: typeof fetch = async (input, init) => {
  const caller =
    init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const deadline = AbortSignal.timeout(timeoutMs);
  const response = await fetch(input, {
    ...init,
    signal: caller ? AbortSignal.any([caller, deadline]) : deadline,
  });
  const lapsed = await readSessionLapsed(response);
  if (!lapsed) return response;
  leaveFor(lapsed);
  return new Promise<never>(() => undefined);
};
