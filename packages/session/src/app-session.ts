// How core hands an app its own token. Core's `/refresh` sends the browser
// to the app's callback with a token minted for the app, and the app's guard
// answers the callback itself, so neither the adapters nor the app's code
// know it is there. Both paths are the guard's on every guarded app.

/** The callback where core hands the app its token, or none. */
export const appSessionPath = "/_robkit/session";

/**
 * Where a call from the page sends the browser when the app's token has
 * expired. It starts the trip through core, as a page load would.
 */
export const appRefreshPath = "/_robkit/refresh";

/**
 * The app's callback on `next`'s origin, carrying `token`, or none if
 * nobody is signed in, and the `state` the app's guard sent core.
 */
export function appSessionUrl(
  next: string,
  { token, state }: { token?: string | undefined; state?: string | undefined },
): string {
  const url = new URL(appSessionPath, next);
  url.searchParams.set("next", next);
  if (state !== undefined) url.searchParams.set("state", state);
  if (token !== undefined) url.searchParams.set("token", token);
  return url.href;
}
