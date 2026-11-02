import type { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { registerApps } from "./apps.ts";
import {
  claim,
  freshCore,
  postJson,
  roleIdsByName,
  sessionCookieOf,
  withSession,
} from "./test/fresh-app.ts";

async function accessOf(app: Hono, slug: string) {
  const res = await app.request(`/apps/${slug}/access`);
  return { status: res.status, body: await res.json() };
}

function setAccess(app: Hono, owner: string, slug: string, access: unknown) {
  return postJson(app, `/apps/${slug}/access`, access, withSession(owner));
}

describe("registerApps", () => {
  it("adds each new app as owner-only, named after its slug", async () => {
    const { app, db } = await freshCore();

    await registerApps(db, ["example", "notes"]);

    expect(await accessOf(app, "example")).toEqual({
      status: 200,
      body: { kind: "owner" },
    });
    expect(await accessOf(app, "notes")).toEqual({
      status: 200,
      body: { kind: "owner" },
    });
  });

  it("keeps the rule the owner set when it runs again", async () => {
    const { app, db } = await freshCore();
    const owner = await claim(app);
    await registerApps(db, ["example"]);
    await setAccess(app, owner, "example", { kind: "open" });

    await registerApps(db, ["example"]);

    expect((await accessOf(app, "example")).body).toEqual({ kind: "open" });
  });
});

describe("GET /apps/:slug/access", () => {
  it("answers 404 for an app core doesn't know", async () => {
    const { app } = await freshCore();

    expect(await accessOf(app, "nope")).toEqual({
      status: 404,
      body: { error: "Not found" },
    });
  });

  it("needs no cookie", async () => {
    const { app, db } = await freshCore();
    await registerApps(db, ["example"]);

    const res = await app.request("/apps/example/access");

    expect(res.status).toBe(200);
  });
});

describe("POST /apps/:slug/access", () => {
  it("gates an app to roles, then opens it to anyone", async () => {
    const { app, db } = await freshCore();
    const owner = await claim(app);
    await registerApps(db, ["example"]);
    const { Family, Friends } = await roleIdsByName(app, owner);

    const gated = await setAccess(app, owner, "example", {
      kind: "roles",
      roles: [Friends, Family, Friends],
    });
    const gatedAccess = await accessOf(app, "example");
    const opened = await setAccess(app, owner, "example", { kind: "open" });

    expect(gated.status).toBe(200);
    expect(await gated.json()).toEqual({
      kind: "roles",
      roles: [Family, Friends],
    });
    expect(gatedAccess.body).toEqual({
      kind: "roles",
      roles: [Family, Friends],
    });
    expect(opened.status).toBe(200);
    expect((await accessOf(app, "example")).body).toEqual({ kind: "open" });
  });

  it.each([
    [{ kind: "everyone" }, "Pick open, roles or owner."],
    [{ kind: "roles" }, "Pick at least one role."],
    [{ kind: "roles", roles: [] }, "Pick at least one role."],
    [
      { kind: "roles", roles: ["00000000-0000-4000-8000-000000000000"] },
      "One of those roles doesn't exist.",
    ],
    [{ kind: "roles", roles: ["family"] }, "One of those roles doesn't exist."],
  ])("refuses %j", async (access, error) => {
    const { app, db } = await freshCore();
    const owner = await claim(app);
    await registerApps(db, ["example"]);

    const res = await setAccess(app, owner, "example", access);

    expect({ status: res.status, body: await res.json() }).toEqual({
      status: 400,
      body: { error },
    });
    expect((await accessOf(app, "example")).body).toEqual({ kind: "owner" });
  });

  it("answers 404 for an app core doesn't know", async () => {
    const { app } = await freshCore();
    const owner = await claim(app);

    const res = await setAccess(app, owner, "nope", { kind: "open" });

    expect(res.status).toBe(404);
  });

  it("answers anyone but the owner with 404", async () => {
    const { app, db } = await freshCore({ domain: "robkit.localhost" });
    await claim(app);
    await registerApps(db, ["example"]);
    const signIn = await postJson(app, "/login/code", { code: "test" });
    const guest = withSession(sessionCookieOf(signIn)?.value ?? "");

    const answers = [
      await postJson(app, "/apps/example/access", { kind: "open" }),
      await postJson(app, "/apps/example/access", { kind: "open" }, guest),
      await app.request("/apps", { headers: guest }),
    ];

    expect(answers.map((res) => res.status)).toEqual([404, 404, 404]);
    expect((await accessOf(app, "example")).body).toEqual({ kind: "owner" });
  });
});

describe("GET /apps", () => {
  it("lists every app with its name and rule for the owner", async () => {
    const { app, db } = await freshCore();
    const owner = await claim(app);
    await registerApps(db, ["notes", "example"]);
    await setAccess(app, owner, "notes", { kind: "open" });

    const res = await app.request("/apps", { headers: withSession(owner) });

    expect(await res.json()).toEqual({
      apps: [
        { slug: "example", name: "example", access: { kind: "owner" } },
        { slug: "notes", name: "notes", access: { kind: "open" } },
      ],
    });
  });
});
