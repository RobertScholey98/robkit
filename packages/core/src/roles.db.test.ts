import type { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  claim,
  freshCore,
  postJson,
  sessionCookieOf,
  withSession,
} from "./test/fresh-app.ts";

interface RoleAnswer {
  id: string;
  name: string;
  codeIds: string[];
}

async function mint(app: Hono, owner: string, name: string): Promise<string> {
  const res = await postJson(app, "/codes", { name }, withSession(owner));
  return ((await res.json()) as { id: string }).id;
}

async function listRoles(app: Hono, owner: string): Promise<RoleAnswer[]> {
  const res = await app.request("/roles", { headers: withSession(owner) });
  return ((await res.json()) as { roles: RoleAnswer[] }).roles;
}

describe("GET /roles", () => {
  it("lists the seeded Family and Friends, holding no codes", async () => {
    const { app } = await freshCore();
    const owner = await claim(app);

    expect(await listRoles(app, owner)).toEqual([
      { id: expect.any(String) as string, name: "Family", codeIds: [] },
      { id: expect.any(String) as string, name: "Friends", codeIds: [] },
    ]);
  });

  it("lists each role with only the codes that hold it", async () => {
    const { app } = await freshCore();
    const owner = await claim(app);
    const gran = await mint(app, owner, "Gran");
    const sam = await mint(app, owner, "Sam");
    const kit = await mint(app, owner, "Kit");
    const create = (name: string, codeIds: string[]) =>
      postJson(app, "/roles", { name, codeIds }, withSession(owner));
    await create("Book club", [gran, kit]);
    await create("Cooks", [sam]);
    await create("Neighbours", []);

    const byName = Object.fromEntries(
      (await listRoles(app, owner)).map(({ name, codeIds }) => [
        name,
        [...codeIds].sort(),
      ]),
    );

    expect(Object.keys(byName)).toEqual([
      "Book club",
      "Cooks",
      "Family",
      "Friends",
      "Neighbours",
    ]);
    expect(byName).toEqual({
      "Book club": [gran, kit].sort(),
      Cooks: [sam],
      Family: [],
      Friends: [],
      Neighbours: [],
    });
  });
});

describe("POST /roles", () => {
  it("creates a role holding the codes the owner ticked", async () => {
    const { app } = await freshCore();
    const owner = await claim(app);
    const gran = await mint(app, owner, "Gran");
    await mint(app, owner, "Sam");

    const res = await postJson(
      app,
      "/roles",
      { name: " Book club ", codeIds: [gran] },
      withSession(owner),
    );

    expect(res.status).toBe(201);
    const created = (await res.json()) as RoleAnswer;
    expect(created).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/) as string,
      name: "Book club",
      codeIds: [gran],
    });
    expect(await listRoles(app, owner)).toContainEqual(created);
  });

  it("refuses a name another role has", async () => {
    const { app } = await freshCore();
    const owner = await claim(app);

    const res = await postJson(
      app,
      "/roles",
      { name: "Family", codeIds: [] },
      withSession(owner),
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "There's a role with that name.",
    });
  });

  it.each([
    [{ name: "", codeIds: [] }, "Give the role a name of 1 to 40 characters."],
    [
      { name: "x".repeat(41), codeIds: [] },
      "Give the role a name of 1 to 40 characters.",
    ],
    [{ name: "Book club" }, "Send codeIds, a list of code ids."],
    [{ name: "Book club", codeIds: [1] }, "Send codeIds, a list of code ids."],
    [
      { name: "Book club", codeIds: ["00000000-0000-4000-8000-000000000000"] },
      "One of those codes doesn't exist.",
    ],
    [
      { name: "Book club", codeIds: ["not-a-uuid"] },
      "One of those codes doesn't exist.",
    ],
  ])("refuses %j", async (body, error) => {
    const { app } = await freshCore();
    const owner = await claim(app);

    const res = await postJson(app, "/roles", body, withSession(owner));

    expect({ status: res.status, body: await res.json() }).toEqual({
      status: 400,
      body: { error },
    });
    expect(await listRoles(app, owner)).toHaveLength(2);
  });
});

describe("POST /roles/:id/codes", () => {
  it("replaces the codes that hold the role", async () => {
    const { app } = await freshCore();
    const owner = await claim(app);
    const gran = await mint(app, owner, "Gran");
    const sam = await mint(app, owner, "Sam");
    const [family] = await listRoles(app, owner);
    const set = (codeIds: string[]) =>
      postJson(
        app,
        `/roles/${family?.id ?? ""}/codes`,
        { codeIds },
        withSession(owner),
      );

    const first = await set([gran, sam]);
    const second = await set([sam]);

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(await second.json()).toEqual({ ...family, codeIds: [sam] });
    expect((await listRoles(app, owner))[0]).toEqual({
      ...family,
      codeIds: [sam],
    });
  });

  it("refuses a code that doesn't exist, changing nothing", async () => {
    const { app } = await freshCore();
    const owner = await claim(app);
    const gran = await mint(app, owner, "Gran");
    const [family] = await listRoles(app, owner);
    const path = `/roles/${family?.id ?? ""}/codes`;
    await postJson(app, path, { codeIds: [gran] }, withSession(owner));

    const res = await postJson(
      app,
      path,
      { codeIds: [gran, "00000000-0000-4000-8000-000000000000"] },
      withSession(owner),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "One of those codes doesn't exist.",
    });
    expect((await listRoles(app, owner))[0]?.codeIds).toEqual([gran]);
  });

  it.each(["00000000-0000-4000-8000-000000000000", "not-a-uuid"])(
    "answers 404 for a role %s that doesn't exist",
    async (id) => {
      const { app } = await freshCore();
      const owner = await claim(app);

      const res = await postJson(
        app,
        `/roles/${id}/codes`,
        { codeIds: [] },
        withSession(owner),
      );

      expect(res.status).toBe(404);
    },
  );
});

describe("the role endpoints", () => {
  it("answer anyone but the owner with 404", async () => {
    const { app } = await freshCore();
    const owner = await claim(app);
    const minted = await postJson(
      app,
      "/codes",
      { name: "Gran" },
      withSession(owner),
    );
    const { code } = (await minted.json()) as { code: string };
    const signIn = await postJson(app, "/login/code", { code });
    const guest = withSession(sessionCookieOf(signIn)?.value ?? "");
    const [family] = await listRoles(app, owner);

    const answers = await Promise.all(
      [{}, guest].flatMap((cookie) => [
        Promise.resolve(app.request("/roles", { headers: cookie })),
        postJson(app, "/roles", { name: "Eve's", codeIds: [] }, cookie),
        postJson(
          app,
          `/roles/${family?.id ?? ""}/codes`,
          { codeIds: [] },
          cookie,
        ),
      ]),
    );

    expect(answers.map((res) => res.status)).toEqual([
      404, 404, 404, 404, 404, 404,
    ]);
    expect(await listRoles(app, owner)).toHaveLength(2);
  });
});
