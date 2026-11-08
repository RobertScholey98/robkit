import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Viewer } from "@robkit/guard";
import { orThrow, parseJson } from "@robkit/input";
import { headers } from "next/headers.js";
import { readViewer } from "./read-viewer.ts";

/** The request header the proxy passes the viewer on to the app in. */
export const viewerHeader = "robkit-viewer";

const keyName = Symbol.for("@robkit/next viewer key");

/**
 * This server's key, which the proxy puts beside each viewer it passes on.
 * A client can send a `robkit-viewer` header of its own on a path the
 * proxy's matcher leaves out, but can't know the key. The proxy and the
 * app's code run in one Node process under `next dev` and `next start`, but
 * are bundled apart, so the key lives on `globalThis` rather than in a
 * module.
 */
function serverKey(): string {
  const held: unknown = Reflect.get(globalThis, keyName);
  if (typeof held === "string") return held;
  const key = randomBytes(32).toString("base64url");
  Reflect.set(globalThis, keyName, key);
  return key;
}

/** The header value that passes `viewer` on to the app. */
export function viewerValue(viewer: Viewer): string {
  const body = Buffer.from(JSON.stringify(viewer)).toString("base64url");
  return `${serverKey()}.${body}`;
}

/** What follows this server's key in `value`, if it starts with the key. */
function afterKey(value: string): string | undefined {
  const [sent = "", rest] = value.split(".", 2);
  const [a, b] = [Buffer.from(sent), Buffer.from(serverKey())];
  return rest !== undefined && a.length === b.length && timingSafeEqual(a, b)
    ? rest
    : undefined;
}

/**
 * Who is asking, as the proxy's guard passed it on. For server components,
 * route handlers and server actions, in a request the proxy guarded.
 *
 * @throws when the proxy didn't guard this request: `src/proxy.ts` doesn't
 *   export `guarded`'s proxy, or its matcher leaves this path out.
 */
export async function viewer(): Promise<Viewer> {
  const body = afterKey((await headers()).get(viewerHeader) ?? "");
  if (body === undefined) {
    throw new Error(
      `robkit's guard didn't run for this request, so it has no ${viewerHeader} header. Export guarded's proxy from src/proxy.ts, with a matcher that covers this path.`,
    );
  }
  const text = Buffer.from(body, "base64url").toString();
  return orThrow(readViewer(orThrow(parseJson(text, viewerHeader)).json));
}
