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
import { slug } from "@internal/test-session";

const minute = 60_000;

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

    await registerApps(db, [
      { slug: slug("example") },
      { slug: slug("notes") },
    ]);

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
    await registerApps(db, [{ slug: slug("example") }]);
    await setAccess(app, owner, "example", { kind: "open" });

    await registerApps(db, [{ slug: slug("example") }]);

    expect((await accessOf(app, "example")).body).toEqual({ kind: "open" });
  });

  it("adds a new app with the rule it declares", async () => {
    const { app, db } = await freshCore();

    await registerApps(db, [
      { slug: slug("notes"), access: { kind: "open" } },
      { slug: slug("diary"), access: { kind: "owner" } },
    ]);

    expect((await accessOf(app, "notes")).body).toEqual({ kind: "open" });
    expect((await accessOf(app, "diary")).body).toEqual({ kind: "owner" });
  });

  it("gates a new app to the roles it names, creating any the owner lacks", async () => {
    const { app, db } = await freshCore();
    const owner = await claim(app);

    await registerApps(db, [
      {
        slug: slug("recipes"),
        access: { kind: "roles", roleNames: ["Family", "Cooks", "Cooks"] },
      },
    ]);

    const ids = await roleIdsByName(app, owner);
    expect(Object.keys(ids).sort()).toEqual(["Cooks", "Family", "Friends"]);
    const { body } = await accessOf(app, "recipes");
    expect(body).toEqual({ kind: "roles", roles: expect.any(Array) as never });
    expect(new Set((body as { roles: string[] }).roles)).toEqual(
      new Set([ids.Family, ids.Cooks]),
    );
  });

  it("registers each app once, with its whole rule, when several cores start together", async () => {
    const { app, db } = await freshCore();
    const owner = await claim(app);
    const declared = [
      {
        slug: slug("recipes"),
        access: { kind: "roles" as const, roleNames: ["Family", "Cooks"] },
      },
      { slug: slug("notes"), access: { kind: "open" as const } },
    ];

    await Promise.all(
      Array.from({ length: 6 }, () => registerApps(db, declared)),
    );

    const ids = await roleIdsByName(app, owner);
    expect(Object.keys(ids).sort()).toEqual(["Cooks", "Family", "Friends"]);
    expect((await accessOf(app, "recipes")).body).toEqual({
      kind: "roles",
      roles: [ids.Cooks, ids.Family],
    });
    expect((await accessOf(app, "notes")).body).toEqual({ kind: "open" });
  });

  it("keeps the owner's rule but takes the icon an app declares now", async () => {
    const { app, db } = await freshCore();
    const owner = await claim(app);
    await registerApps(db, [{ slug: slug("notes"), access: { kind: "open" } }]);
    await setAccess(app, owner, "notes", { kind: "owner" });

    await registerApps(db, [
      { slug: slug("notes"), access: { kind: "open" }, icon: "📝" },
    ]);

    const res = await app.request("/apps", { headers: withSession(owner) });
    expect(await res.json()).toEqual({
      apps: [
        { slug: "notes", name: "notes", icon: "📝", access: { kind: "owner" } },
      ],
    });
  });
});

describe("an app ROBKIT_APPS no longer lists", () => {
  it("is gone from the launcher, admin's list and its access", async () => {
    const { app, db } = await freshCore();
    const owner = await claim(app);
    await registerApps(db, [{ slug: slug("notes") }, { slug: slug("diary") }]);

    await registerApps(db, [{ slug: slug("notes") }]);

    const launcher = await app.request("/launcher", {
      headers: withSession(owner),
    });
    const listed = await app.request("/apps", { headers: withSession(owner) });
    expect({
      launcher: await launcher.json(),
      admin: await listed.json(),
      diary: await accessOf(app, "diary"),
    }).toEqual({
      launcher: { apps: [{ slug: "notes", name: "notes", icon: null }] },
      admin: {
        apps: [
          {
            slug: "notes",
            name: "notes",
            icon: null,
            access: { kind: "owner" },
          },
        ],
      },
      diary: { status: 404, body: { error: "Not found" } },
    });
  });

  it("gets no token from /refresh, and a change to its access answers unknown app", async () => {
    const { app, db } = await freshCore();
    const owner = await claim(app);
    await registerApps(db, [{ slug: slug("diary") }]);
    const refresh = () =>
      app.request(
        `/refresh?next=${encodeURIComponent("https://diary.robkit.test/")}&state=${"s".repeat(43)}`,
        { headers: withSession(owner) },
      );
    const before = await refresh();

    await registerApps(db, []);

    const after = await refresh();
    const changed = await setAccess(app, owner, "diary", { kind: "open" });
    expect(before.status).toBe(302);
    expect({ status: after.status, body: await after.json() }).toEqual({
      status: 400,
      body: { error: "Send next, a URL on one of this install's apps." },
    });
    expect({ status: changed.status, body: await changed.json() }).toEqual({
      status: 404,
      body: { error: "Not found" },
    });
  });

  it("comes back as a new app, with the rule its manifest declares and none of its old roles", async () => {
    const { app, db } = await freshCore();
    const owner = await claim(app);
    await registerApps(db, [{ slug: slug("recipes") }]);
    const { Family, Friends } = await roleIdsByName(app, owner);
    await setAccess(app, owner, "recipes", { kind: "roles", roles: [Friends] });

    await registerApps(db, []);
    await registerApps(db, [
      {
        slug: slug("recipes"),
        access: { kind: "roles", roleNames: ["Family"] },
      },
    ]);

    expect((await accessOf(app, "recipes")).body).toEqual({
      kind: "roles",
      roles: [Family],
    });
  });

  it("comes back owner only when its manifest declares no rule, whatever the owner set", async () => {
    const { app, db } = await freshCore();
    const owner = await claim(app);
    await registerApps(db, [{ slug: slug("notes") }]);
    await setAccess(app, owner, "notes", { kind: "open" });

    await registerApps(db, [{ slug: slug("diary") }]);
    await registerApps(db, [{ slug: slug("notes") }]);

    expect((await accessOf(app, "notes")).body).toEqual({ kind: "owner" });
  });

  it("goes with every other app when the list is empty", async () => {
    const { app, db } = await freshCore();
    const owner = await claim(app);
    await registerApps(db, [{ slug: slug("notes") }, { slug: slug("diary") }]);

    await registerApps(db, []);

    const res = await app.request("/apps", { headers: withSession(owner) });
    expect(await res.json()).toEqual({ apps: [] });
  });

  it("leaves the roles themselves, which other apps and codes may hold", async () => {
    const { app, db } = await freshCore();
    const owner = await claim(app);
    await registerApps(db, [
      {
        slug: slug("recipes"),
        access: { kind: "roles", roleNames: ["Cooks"] },
      },
    ]);

    await registerApps(db, []);

    expect(Object.keys(await roleIdsByName(app, owner)).sort()).toEqual([
      "Cooks",
      "Family",
      "Friends",
    ]);
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

  it("answers each app's own rule, whatever the others' are", async () => {
    const { app, db } = await freshCore();
    const owner = await claim(app);
    await registerApps(db, [
      { slug: slug("notes"), access: { kind: "open" } },
      { slug: slug("diary"), access: { kind: "owner" } },
      {
        slug: slug("recipes"),
        access: { kind: "roles", roleNames: ["Family", "Cooks"] },
      },
    ]);
    const { Cooks, Family } = await roleIdsByName(app, owner);

    const answers = await Promise.all(
      ["notes", "diary", "recipes", "nope"].map((slug) => accessOf(app, slug)),
    );

    expect(answers).toEqual([
      { status: 200, body: { kind: "open" } },
      { status: 200, body: { kind: "owner" } },
      { status: 200, body: { kind: "roles", roles: [Cooks, Family] } },
      { status: 404, body: { error: "Not found" } },
    ]);
  });

  it("needs no cookie", async () => {
    const { app, db } = await freshCore();
    await registerApps(db, [{ slug: slug("example") }]);

    const res = await app.request("/apps/example/access");

    expect(res.status).toBe(200);
  });

  it("answers a guest and the owner as it answers anyone", async () => {
    const local = "http://core.robkit.localhost:3000";
    const { app, db } = await freshCore({
      origin: local,
    });
    const owner = await claim(app, local);
    await registerApps(db, [{ slug: slug("example") }]);
    const signIn = await postJson(app, "/login/code", { code: "test" });
    const guest = sessionCookieOf(signIn, local)?.value ?? "";

    const answers = await Promise.all(
      [{}, withSession(guest, local), withSession(owner, local)].map(
        async (headers) => {
          const res = await app.request("/apps/example/access", { headers });
          return { status: res.status, body: await res.json() };
        },
      ),
    );

    expect(answers).toEqual([
      { status: 200, body: { kind: "owner" } },
      { status: 200, body: { kind: "owner" } },
      { status: 200, body: { kind: "owner" } },
    ]);
  });
});

describe("POST /apps/:slug/access", () => {
  it("answers 404 for a name that can't be a slug", async () => {
    const { app } = await freshCore();
    const owner = await claim(app);

    const res = await setAccess(app, owner, "Not-A-Slug", { kind: "open" });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("gates an app to roles, then opens it to anyone", async () => {
    const { app, db } = await freshCore();
    const owner = await claim(app);
    await registerApps(db, [{ slug: slug("example") }]);
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
    await registerApps(db, [{ slug: slug("example") }]);

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
    const local = "http://core.robkit.localhost:3000";
    const { app, db } = await freshCore({
      origin: local,
    });
    await claim(app, local);
    await registerApps(db, [{ slug: slug("example") }]);
    const signIn = await postJson(app, "/login/code", { code: "test" });
    const guest = withSession(
      sessionCookieOf(signIn, local)?.value ?? "",
      local,
    );

    const answers = [
      await postJson(app, "/apps/example/access", { kind: "open" }),
      await postJson(app, "/apps/example/access", { kind: "open" }, guest),
      await app.request("/apps", { headers: guest }),
    ];

    expect(answers.map((res) => res.status)).toEqual([404, 404, 404]);
    expect((await accessOf(app, "example")).body).toEqual({ kind: "owner" });
  });

  it("renews no cookie for a guest it refuses", async () => {
    const local = "http://core.robkit.localhost:3000";
    const { app, db, advance } = await freshCore({
      origin: local,
    });
    await claim(app, local);
    await registerApps(db, [{ slug: slug("example") }]);
    const signIn = await postJson(app, "/login/code", { code: "test" });
    const guest = withSession(
      sessionCookieOf(signIn, local)?.value ?? "",
      local,
    );
    advance(16 * minute);

    const res = await postJson(
      app,
      "/apps/example/access",
      { kind: "open" },
      guest,
    );

    expect(res.status).toBe(404);
    expect(sessionCookieOf(res, local)).toBeUndefined();
  });
});

describe("GET /apps", () => {
  it("lists every app with its name and rule for the owner", async () => {
    const { app, db } = await freshCore();
    const owner = await claim(app);
    await registerApps(db, [
      { slug: slug("notes") },
      { slug: slug("example") },
    ]);
    await setAccess(app, owner, "notes", { kind: "open" });

    const res = await app.request("/apps", { headers: withSession(owner) });

    expect(await res.json()).toEqual({
      apps: [
        {
          slug: "example",
          name: "example",
          icon: null,
          access: { kind: "owner" },
        },
        { slug: "notes", name: "notes", icon: null, access: { kind: "open" } },
      ],
    });
  });
});
