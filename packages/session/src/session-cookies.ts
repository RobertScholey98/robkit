import { sessionCookie } from "./session-token.ts";

/** The guard's state cookie's name, before any prefix. */
const stateCookie = "robkit_state";

/** The cookies a session lives in on one install, and how each is set. */
export interface SessionCookies {
  /** The session cookie: core's own on core's host, each app's on its host. */
  session: string;
  /** The guard's state cookie, which ties a trip through core to a browser. */
  state: string;
  /**
   * Every one is host-only: `Path=/` and no `Domain`, so only the host that
   * set it gets it. `secure` is true on an https install.
   */
  attributes: {
    path: "/";
    httpOnly: true;
    sameSite: "Lax";
    secure: boolean;
  };
}

/**
 * The cookies a session lives in on the install at `origin`, which may be
 * core's origin or an app's. On https each is `Secure` and its name starts
 * with `__Host-`. A browser sets a `__Host-` cookie only when it is
 * `Secure`, has `Path=/` and names no `Domain`, so an app on a sibling
 * subdomain can't plant one for another host. On http, which robkit
 * allows only on a local install, the prefix can't be used, so the names
 * are plain. The protocol decides, not the domain.
 */
export function sessionCookies(origin: string): SessionCookies {
  const secure = new URL(origin).protocol === "https:";
  const prefix = secure ? "__Host-" : "";
  return {
    session: `${prefix}${sessionCookie}`,
    state: `${prefix}${stateCookie}`,
    attributes: { path: "/", httpOnly: true, sameSite: "Lax", secure },
  };
}
