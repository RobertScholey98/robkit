import type { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { registerApps } from "./apps.ts";
import {
  claim,
  freshCore,
  postJson,
  sessionCookieOf,
} from "./test/fresh-app.ts";

const minute = 60_000;

function withSession(sessionToken: string) {
  return { cookie: `robkit_session=${sessionToken}` };
}

async function launcher(app: Hono, sessionToken?: string) {
  const res = await app.request("/launcher", {
    headers: sessionToken === undefined ? {} : withSession(sessionToken),
  });
  const { apps } = (await res.json()) as { apps: { slug: string }[] };
  return apps.map((listed) => listed.slug);
}

/**
 * An install with an app for each kind of rule, and a guest whose code
 * holds Family.
 */
async function install() {
  const core = await freshCore();
  const { app, db } = core;
  const owner = await claim(app);
  await registerApps(db, ["family", "friends", "open", "private"]);
  const res = await app.request("/roles", { headers: withSession(owner) });
  const { roles } = (await res.json()) as {
    roles: { id: string; name: string }[];
  };
  const roleId = (name: string) =>
    roles.find((role) => role.name === name)?.id ?? "";
  const gate = (slug: string, access: unknown) =>
    postJson(app, `/apps/${slug}/access`, access, withSession(owner));
  await gate("family", { kind: "roles", roles: [roleId("Family")] });
  await gate("friends", { kind: "roles", roles: [roleId("Friends")] });
  await gate("open", { kind: "open" });

  const minted = await postJson(
    app,
    "/codes",
    { name: "Gran" },
    withSession(owner),
  );
  const { id, code } = (await minted.json()) as { id: string; code: string };
  await postJson(
    app,
    `/roles/${roleId("Family")}/codes`,
    { codeIds: [id] },
    withSession(owner),
  );
  const signIn = await postJson(app, "/login/code", { code });
  const guest = sessionCookieOf(signIn)?.value ?? "";
  return { ...core, owner, guest, gate, roleId };
}

describe("GET /launcher", () => {
  it("lists every app for the owner", async () => {
    const { app, owner } = await install();

    expect(await launcher(app, owner)).toEqual([
      "family",
      "friends",
      "open",
      "private",
    ]);
  });

  it("lists a guest only the apps their roles and open rules let in", async () => {
    const { app, guest } = await install();

    expect(await launcher(app, guest)).toEqual(["family", "open"]);
  });

  it("lists the apps open to anyone when nobody is signed in", async () => {
    const { app } = await install();

    expect(await launcher(app)).toEqual(["open"]);
  });

  it("follows a new rule straight away", async () => {
    const { app, guest, gate, roleId } = await install();

    await gate("friends", { kind: "roles", roles: [roleId("Family")] });
    await gate("open", { kind: "owner" });

    expect(await launcher(app, guest)).toEqual(["family", "friends"]);
  });

  it("names each app and renews an expired token", async () => {
    const { app, guest, advance } = await install();
    advance(16 * minute);

    const res = await app.request("/launcher", {
      headers: withSession(guest),
    });

    expect(await res.json()).toEqual({
      apps: [
        { slug: "family", name: "family" },
        { slug: "open", name: "open" },
      ],
    });
    expect(sessionCookieOf(res)?.value).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
  });
});
