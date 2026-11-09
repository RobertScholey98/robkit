import type { Hono } from "hono";
import { decodeJwt } from "jose";
import { describe, expect, it } from "vitest";
import {
  claim,
  freshCore,
  postJson,
  roleIdsByName,
  sessionCookieOf,
  withSession,
} from "./test/fresh-app.ts";

const minute = 60_000;

async function signIn(app: Hono, code: string): Promise<string> {
  const res = await postJson(app, "/login/code", { code });
  return sessionCookieOf(res)?.value ?? "";
}

/** The roles a session token carries. */
function rolesIn(sessionToken: string): unknown {
  return decodeJwt(sessionToken).roles;
}

/** The token /refresh hands back for `sessionToken` on an install's domain. */
async function refreshed(
  app: Hono,
  sessionToken: string,
  domain = "robkit.test",
): Promise<string> {
  return sessionCookieOf(await refresh(app, sessionToken, domain))?.value ?? "";
}

function refresh(app: Hono, sessionToken: string, domain = "robkit.test") {
  const next = encodeURIComponent(`https://notes.${domain}/`);
  return Promise.resolve(
    app.request(`/refresh?next=${next}`, {
      headers: withSession(sessionToken),
    }),
  );
}

describe("a guest's session token", () => {
  it("carries the roles their code holds", async () => {
    const { app } = await freshCore();
    const owner = await claim(app);
    const minted = await postJson(
      app,
      "/codes",
      { name: "Gran" },
      withSession(owner),
    );
    const { id, code } = (await minted.json()) as { id: string; code: string };
    const { Family, Friends } = await roleIdsByName(app, owner);
    for (const role of [Family, Friends]) {
      await postJson(
        app,
        `/roles/${role ?? ""}/codes`,
        { codeIds: [id] },
        withSession(owner),
      );
    }

    expect(rolesIn(await signIn(app, code))).toEqual([Family, Friends]);
  });

  it("picks up a role change at the next refresh", async () => {
    const { app, advance } = await freshCore();
    const owner = await claim(app);
    const minted = await postJson(
      app,
      "/codes",
      { name: "Gran" },
      withSession(owner),
    );
    const { id, code } = (await minted.json()) as { id: string; code: string };
    const guest = await signIn(app, code);
    const { Friends } = await roleIdsByName(app, owner);

    await postJson(
      app,
      `/roles/${Friends ?? ""}/codes`,
      { codeIds: [id] },
      withSession(owner),
    );
    advance(16 * minute);

    expect(rolesIn(guest)).toEqual([]);
    expect(rolesIn(await refreshed(app, guest))).toEqual([Friends]);
  });

  it("goes to the app with the roles the guest holds now", async () => {
    const { app } = await freshCore();
    const owner = await claim(app);
    const minted = await postJson(
      app,
      "/codes",
      { name: "Gran" },
      withSession(owner),
    );
    const { id, code } = (await minted.json()) as { id: string; code: string };
    const guest = await signIn(app, code);
    const { Friends } = await roleIdsByName(app, owner);
    await postJson(
      app,
      `/roles/${Friends ?? ""}/codes`,
      { codeIds: [id] },
      withSession(owner),
    );

    const res = await refresh(app, guest);
    const location = new URL(res.headers.get("location") ?? "");
    const appToken = location.searchParams.get("token") ?? "";

    expect(decodeJwt(appToken)).toMatchObject({
      aud: "notes",
      sub: id,
      kind: "guest",
      roles: [Friends],
    });
  });

  it("is reissued as soon as core sees the roles changed, so the launcher and apps agree", async () => {
    const { app } = await freshCore();
    const owner = await claim(app);
    const minted = await postJson(
      app,
      "/codes",
      { name: "Gran" },
      withSession(owner),
    );
    const { id, code } = (await minted.json()) as { id: string; code: string };
    const guest = await signIn(app, code);
    const { Family } = await roleIdsByName(app, owner);
    const sameRoles = await app.request("/launcher", {
      headers: withSession(guest),
    });

    await postJson(
      app,
      `/roles/${Family ?? ""}/codes`,
      { codeIds: [id] },
      withSession(owner),
    );
    const changedRoles = await app.request("/launcher", {
      headers: withSession(guest),
    });

    expect(sessionCookieOf(sameRoles)).toBeUndefined();
    expect(rolesIn(sessionCookieOf(changedRoles)?.value ?? "")).toEqual([
      Family,
    ]);
  });

  it("gives the test code every role, even one made after sign-in", async () => {
    const { app } = await freshCore({
      origin: "http://core.robkit.localhost:3000",
    });
    const owner = await claim(app);
    const guest = await signIn(app, "test");
    const created = await postJson(
      app,
      "/roles",
      { name: "Book club", codeIds: [] },
      withSession(owner),
    );
    const bookClub = ((await created.json()) as { id: string }).id;
    const { Family, Friends } = await roleIdsByName(app, owner);

    expect(rolesIn(guest)).toEqual([Family, Friends]);
    expect(rolesIn(await refreshed(app, guest, "robkit.localhost"))).toEqual([
      bookClub,
      Family,
      Friends,
    ]);
  });
});
