import { aDomain } from "@internal/test-session";
import type { Hono } from "hono";
import { decodeJwt, SignJWT, type JWTPayload } from "jose";
import { onTestFinished } from "vitest";
import { createApp } from "../app.ts";
import type { TrustedProxy } from "../client.ts";
import { createDatabase, type Database } from "../database.ts";
import { migrate } from "../migrate.ts";
import { ensureSigningKey } from "../signing-key.ts";
import { freshDatabase } from "./fresh-database.ts";

/** Where every fresh core's clock starts: 2026-11-01T12:00:00Z. */
export const clockStart = new Date("2026-11-01T12:00:00Z");

export interface FreshCore {
  app: Hono;
  db: Database;
  /** Core's clock right now. */
  now: () => Date;
  /** Moves core's clock forward. */
  advance: (ms: number) => void;
}

/**
 * Core on its own migrated database, with a clock the test moves. Closes its
 * connections when the test finishes.
 */
export async function freshCore({
  domain = "robkit.test",
  trustedProxy,
}: {
  domain?: string;
  trustedProxy?: TrustedProxy | undefined;
} = {}): Promise<FreshCore> {
  const databaseUrl = await freshDatabase();
  await migrate(databaseUrl);
  const db = createDatabase(databaseUrl);
  onTestFinished(() => db.$client.end());

  let now = clockStart.getTime();
  const clock = () => new Date(now);
  return {
    app: createApp({ db, domain: aDomain(domain), now: clock, trustedProxy }),
    db,
    now: clock,
    advance: (ms) => {
      now += ms;
    },
  };
}

/** Headers that send `sessionToken` as the session cookie. */
export function withSession(sessionToken: string): Record<string, string> {
  return { cookie: `robkit_session=${sessionToken}` };
}

/** Each role's id, by its name, as the owner lists them. */
export async function roleIdsByName(
  app: Hono,
  owner: string,
): Promise<Record<string, string>> {
  const res = await app.request("/roles", { headers: withSession(owner) });
  const { roles } = (await res.json()) as {
    roles: { id: string; name: string }[];
  };
  return Object.fromEntries(roles.map((role) => [role.name, role.id]));
}

/** POSTs `body` as JSON, as the hub does. */
export function postJson(
  app: Hono,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return Promise.resolve(
    app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

export interface SetCookie {
  value: string;
  /** Each attribute by name; a flag such as HttpOnly maps to `true`. */
  attributes: Record<string, string | true>;
}

/** The `robkit_session` cookie a response sets, if it sets one. */
export function sessionCookieOf(res: Response): SetCookie | undefined {
  const header = res.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("robkit_session="));
  if (header === undefined) return undefined;
  const [pair = "", ...attributes] = header.split(/;\s*/);
  return {
    value: pair.slice("robkit_session=".length),
    attributes: Object.fromEntries(
      attributes.map((attribute) => {
        const [name = "", value] = attribute.split("=");
        return [name, value ?? true];
      }),
    ),
  };
}

/** Claims the install as `rob`, returning the session cookie's value. */
export async function claim(app: Hono): Promise<string> {
  const res = await postJson(app, "/setup", {
    username: "rob",
    password: "correct horse battery",
  });
  const cookie = sessionCookieOf(res);
  if (res.status !== 201 || !cookie) {
    throw new Error(`setup answered ${String(res.status)}`);
  }
  return cookie.value;
}

/**
 * `sessionToken`'s claims re-signed with core's own key, with `claims` in
 * place of its own, such as a token for an app. A claim set to undefined
 * is left out.
 */
export async function resigned(
  db: Database,
  sessionToken: string,
  claims: Record<string, unknown>,
): Promise<string> {
  const key = await ensureSigningKey(db);
  const payload: JWTPayload = decodeJwt(sessionToken);
  return new SignJWT({ ...payload, ...claims })
    .setProtectedHeader({ alg: "EdDSA", kid: key.kid })
    .sign(key.privateKey);
}
