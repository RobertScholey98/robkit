import type { Hono } from "hono";
import { isProblem } from "@robkit/input";
import { describe, expect, it } from "vitest";
import { readDeclaredApps, registerApps } from "./apps.ts";
import {
  claim,
  freshCore,
  postJson,
  roleIdsByName,
  sessionCookieOf,
  withSession,
} from "./test/fresh-app.ts";
import { slug } from "./test/slug.ts";

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

describe("readDeclaredApps", () => {
  it("reads nothing from an unset or empty ROBKIT_APPS", () => {
    expect(readDeclaredApps({})).toEqual([]);
    expect(readDeclaredApps({ ROBKIT_APPS: " " })).toEqual([]);
  });

  it("reads each app's slug, rule and icon", () => {
    expect(
      readDeclaredApps({
        ROBKIT_APPS: JSON.stringify([
          { slug: "example" },
          {
            slug: "recipes",
            access: { kind: "roles", roles: ["Family"] },
            icon: "🍳",
          },
        ]),
      }),
    ).toEqual([
      { slug: "example" },
      {
        slug: "recipes",
        access: { kind: "roles", roleNames: ["Family"] },
        icon: "🍳",
      },
    ]);
  });

  const notSlug = `can't be an app's slug, which is also its subdomain and database role. Use lowercase letters and digits, start with a letter, and avoid public and postgres.`;

  it.each([
    [
      "example,notes",
      /^ROBKIT_APPS isn't valid JSON \(.+\)\. Fix its syntax\.$/,
    ],
    [
      '{"slug":"notes"}',
      `ROBKIT_APPS must be a JSON list of apps, such as [{"slug": "notes"}]. pnpm dev and robkit deploy set it from each app's manifest.`,
    ],
    ["null", /^ROBKIT_APPS must be a JSON list/],
    [
      "[null]",
      `ROBKIT_APPS[0] must be an object with the app's slug, such as {"slug": "notes"}.`,
    ],
    ['[{"slug":""}]', `ROBKIT_APPS[0].slug: "" ${notSlug}`],
    ['[{"icon":"📝"}]', `ROBKIT_APPS[0].slug: Nothing ${notSlug}`],
    [
      '[{"slug":"a"},{"slug":"b","access":{"kind":"everyone"}}]',
      'ROBKIT_APPS[1].access must be {"kind": "open"}, {"kind": "owner"}, or {"kind": "roles", "roles": ["Family"]} naming at least one role.',
    ],
    [
      '[{"slug":"a","access":{"kind":"roles","roles":[]}}]',
      /^ROBKIT_APPS\[0\]\.access must be/,
    ],
    [
      '[{"slug":"a","icon":""}]',
      'ROBKIT_APPS[0].icon must be one emoji, such as "📝".',
    ],
  ])("refuses %s", (text, message) => {
    const read = readDeclaredApps({ ROBKIT_APPS: text });
    expect(isProblem(read) && read.error).toMatch(message);
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
    const { app, db } = await freshCore({ domain: "robkit.localhost" });
    const owner = await claim(app);
    await registerApps(db, [{ slug: slug("example") }]);
    const signIn = await postJson(app, "/login/code", { code: "test" });
    const guest = sessionCookieOf(signIn)?.value ?? "";

    const answers = await Promise.all(
      [{}, withSession(guest), withSession(owner)].map(async (headers) => {
        const res = await app.request("/apps/example/access", { headers });
        return { status: res.status, body: await res.json() };
      }),
    );

    expect(answers).toEqual([
      { status: 200, body: { kind: "owner" } },
      { status: 200, body: { kind: "owner" } },
      { status: 200, body: { kind: "owner" } },
    ]);
  });
});

describe("POST /apps/:slug/access", () => {
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
    const { app, db } = await freshCore({ domain: "robkit.localhost" });
    await claim(app);
    await registerApps(db, [{ slug: slug("example") }]);
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

  it("renews no cookie for a guest it refuses", async () => {
    const { app, db, advance } = await freshCore({
      domain: "robkit.localhost",
    });
    await claim(app);
    await registerApps(db, [{ slug: slug("example") }]);
    const signIn = await postJson(app, "/login/code", { code: "test" });
    const guest = withSession(sessionCookieOf(signIn)?.value ?? "");
    advance(16 * minute);

    const res = await postJson(
      app,
      "/apps/example/access",
      { kind: "open" },
      guest,
    );

    expect(res.status).toBe(404);
    expect(sessionCookieOf(res)).toBeUndefined();
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
