import type { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  claim,
  freshCore,
  postJson,
  sessionCookieOf,
} from "./test/fresh-app.ts";

/** Signs out as the hub does: JSON content type, no body. */
function logout(app: Hono, sessionToken?: string) {
  return Promise.resolve(
    app.request("/logout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(sessionToken && { cookie: `robkit_session=${sessionToken}` }),
      },
    }),
  );
}

async function stateOf(app: Hono, sessionToken: string) {
  const res = await app.request("/session", {
    headers: { cookie: `robkit_session=${sessionToken}` },
  });
  return ((await res.json()) as { state: string }).state;
}

describe("POST /logout", () => {
  it("answers 204 and clears the session cookie", async () => {
    const { app } = await freshCore();
    const sessionToken = await claim(app);

    const res = await logout(app, sessionToken);

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(sessionCookieOf(res)).toEqual({
      value: "",
      attributes: {
        "Max-Age": "0",
        Path: "/",
        HttpOnly: true,
        Secure: true,
        SameSite: "Lax",
      },
    });
  });

  it("revokes the session, so its old cookie no longer signs anyone in", async () => {
    const { app } = await freshCore();
    const sessionToken = await claim(app);
    const before = await stateOf(app, sessionToken);

    await logout(app, sessionToken);

    expect(before).toBe("signed-in");
    expect(await stateOf(app, sessionToken)).toBe("signed-out");
  });

  it("revokes a session whose token has expired", async () => {
    const { app, advance } = await freshCore();
    const sessionToken = await claim(app);
    advance(20 * 60_000);

    await logout(app, sessionToken);

    expect(await stateOf(app, sessionToken)).toBe("signed-out");
  });

  it("leaves the owner's other sessions signed in", async () => {
    const { app } = await freshCore();
    const laptop = await claim(app);
    const phone = sessionCookieOf(
      await postJson(app, "/login", {
        username: "rob",
        password: "correct horse battery",
      }),
    )?.value;

    await logout(app, laptop);

    expect(await stateOf(app, laptop)).toBe("signed-out");
    expect(await stateOf(app, phone ?? "")).toBe("signed-in");
  });

  it("answers 204 again, and without any cookie", async () => {
    const { app } = await freshCore();
    const sessionToken = await claim(app);
    await logout(app, sessionToken);

    expect((await logout(app, sessionToken)).status).toBe(204);
    expect((await logout(app)).status).toBe(204);
    expect((await logout(app, "not-a-token")).status).toBe(204);
  });

  it("still needs a JSON content type, with 415", async () => {
    const { app } = await freshCore();
    const sessionToken = await claim(app);

    const res = await app.request("/logout", {
      method: "POST",
      headers: { cookie: `robkit_session=${sessionToken}` },
    });

    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: "Send JSON." });
    expect(await stateOf(app, sessionToken)).toBe("signed-in");
  });
});
