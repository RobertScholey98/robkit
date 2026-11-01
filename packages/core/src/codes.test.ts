import { sql } from "drizzle-orm";
import type { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  claim,
  clockStart,
  freshCore,
  postJson,
  sessionCookieOf,
} from "./test/fresh-app.ts";

const minute = 60_000;

interface CodeAnswer {
  id: string;
  code: string;
  name: string;
}

function asOwner(sessionToken: string) {
  return { cookie: `robkit_session=${sessionToken}` };
}

function listCodes(app: Hono, sessionToken: string) {
  return Promise.resolve(
    app.request("/codes", { headers: asOwner(sessionToken) }),
  );
}

/** The codes the owner sees, without the seeded test code. */
async function mintedCodes(app: Hono, sessionToken: string) {
  const { codes } = (await (await listCodes(app, sessionToken)).json()) as {
    codes: CodeAnswer[];
  };
  return codes.filter((code) => code.code !== "TEST");
}

describe("POST /codes", () => {
  it("mints a five-character code for a guest", async () => {
    const { app } = await freshCore();
    const owner = await claim(app);

    const res = await postJson(
      app,
      "/codes",
      { name: "Grandma" },
      asOwner(owner),
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/) as string,
      code: expect.stringMatching(
        /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/,
      ) as string,
      name: "Grandma",
      expiresAt: null,
      revokedAt: null,
      createdAt: clockStart.toISOString(),
      standing: "live",
    });
  });
});

it("keeps a custom code, upper-cased, and an expiry", async () => {
  const { app } = await freshCore();
  const owner = await claim(app);

  const res = await postJson(
    app,
    "/codes",
    {
      name: " Grandma ",
      code: " grandma2026",
      expiresAt: "2026-12-25T00:00:00.000Z",
    },
    asOwner(owner),
  );

  expect(res.status).toBe(201);
  expect(await res.json()).toMatchObject({
    code: "GRANDMA2026",
    name: "Grandma",
    expiresAt: "2026-12-25T00:00:00.000Z",
    standing: "live",
  });
});

it.each(["grandma", "TEST"])(
  "refuses a custom code that is taken, such as %s",
  async (code) => {
    const { app } = await freshCore();
    const owner = await claim(app);
    await postJson(
      app,
      "/codes",
      { name: "Gran", code: "GRANDMA" },
      asOwner(owner),
    );

    const res = await postJson(
      app,
      "/codes",
      { name: "Someone", code },
      asOwner(owner),
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "That code is taken." });
    expect((await mintedCodes(app, owner)).map((c) => c.name)).toEqual([
      "Gran",
    ]);
  },
);

it.each([
  [{}, "Give the guest a name of 1 to 80 characters."],
  [{ name: "   " }, "Give the guest a name of 1 to 80 characters."],
  [{ name: "x".repeat(81) }, "Give the guest a name of 1 to 80 characters."],
  [{ name: 7 }, "Give the guest a name of 1 to 80 characters."],
  [{ name: "Gran", code: "ab" }, "Use 3 to 32 letters or digits for the code."],
  [
    { name: "Gran", code: "two words" },
    "Use 3 to 32 letters or digits for the code.",
  ],
  [
    { name: "Gran", code: 12345 },
    "Use 3 to 32 letters or digits for the code.",
  ],
  [
    { name: "Gran", expiresAt: "2026-11-01T11:59:00Z" },
    "Pick an expiry in the future.",
  ],
  [
    { name: "Gran", expiresAt: "2026-11-01T12:00:00Z" },
    "Pick an expiry in the future.",
  ],
  [{ name: "Gran", expiresAt: "soon" }, "Pick an expiry in the future."],
])("refuses %j with 400", async (body, error) => {
  const { app } = await freshCore();
  const owner = await claim(app);

  const res = await postJson(app, "/codes", body, asOwner(owner));

  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error });
  expect(await mintedCodes(app, owner)).toEqual([]);
});

describe("GET /codes", () => {
  it("lists the seeded test code, which won't work off a local domain", async () => {
    const { app } = await freshCore();
    const owner = await claim(app);

    const res = await listCodes(app, owner);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      codes: [
        {
          id: expect.any(String) as string,
          code: "TEST",
          name: "Test",
          expiresAt: null,
          revokedAt: null,
          createdAt: expect.any(String) as string,
          standing: "local-only",
        },
      ],
    });
  });

  it("lists the codes the owner minted, newest first", async () => {
    const { app, advance } = await freshCore();
    const owner = await claim(app);
    const mint = (name: string) =>
      postJson(app, "/codes", { name }, asOwner(owner));
    const first = (await (await mint("Grandma")).json()) as CodeAnswer;
    advance(minute);
    const second = (await (await mint("Uncle Bob")).json()) as CodeAnswer;

    expect(await mintedCodes(app, owner)).toEqual([second, first]);
  });
});

describe("POST /codes/:id/revoke", () => {
  function revoke(app: Hono, sessionToken: string, id: string) {
    return postJson(app, `/codes/${id}/revoke`, {}, asOwner(sessionToken));
  }

  it("revokes a code, once", async () => {
    const { app, advance, now } = await freshCore();
    const owner = await claim(app);
    const minted = await postJson(
      app,
      "/codes",
      { name: "Gran" },
      asOwner(owner),
    );
    const { id } = (await minted.json()) as CodeAnswer;
    advance(minute);
    const revokedAt = now().toISOString();

    const first = await revoke(app, owner, id);
    advance(minute);
    const again = await revoke(app, owner, id);

    expect([first.status, again.status]).toEqual([204, 204]);
    expect(await mintedCodes(app, owner)).toMatchObject([
      { id, revokedAt, standing: "revoked" },
    ]);
  });

  it.each([
    ["an unknown code", "6f1d1b8e-0000-4000-8000-000000000000"],
    ["something that isn't an id", "not-an-id"],
  ])("answers %s with 404", async (_, id) => {
    const { app } = await freshCore();
    const owner = await claim(app);

    const res = await revoke(app, owner, id);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});

describe("the code endpoints", () => {
  it.each([
    ["nobody signed in", undefined],
    ["a revoked owner session", "revoked"],
    ["a token from another install", "foreign"],
  ])("answer %s with 404", async (_, holder) => {
    const { app, db } = await freshCore();
    const owner = await claim(app);
    const tokens: Record<string, string> = {
      revoked: owner,
      foreign: await claim((await freshCore()).app),
    };
    if (holder === "revoked") {
      await db.execute(sql`update core.sessions set revoked_at = now()`);
    }
    const cookie = holder === undefined ? {} : asOwner(tokens[holder] ?? "");

    const list = await app.request("/codes", { headers: cookie });
    const mint = await postJson(app, "/codes", { name: "Eve" }, cookie);
    const [test] = await db.execute<{ id: string }>(
      sql`select id from core.access_codes`,
    );
    const revoke = await postJson(
      app,
      `/codes/${test?.id ?? ""}/revoke`,
      {},
      cookie,
    );

    const answers = [list, mint, revoke];
    expect(answers.map((res) => res.status)).toEqual([404, 404, 404]);
    expect(await Promise.all(answers.map((res) => res.json()))).toEqual([
      { error: "Not found" },
      { error: "Not found" },
      { error: "Not found" },
    ]);
    expect(
      await db.execute(sql`select code, revoked_at from core.access_codes`),
    ).toEqual([{ code: "TEST", revoked_at: null }]);
  });

  it("answer a guest with 404", async () => {
    const { app } = await freshCore();
    const owner = await claim(app);
    const minted = await postJson(
      app,
      "/codes",
      { name: "Gran" },
      asOwner(owner),
    );
    const { id, code } = (await minted.json()) as CodeAnswer;
    const signIn = await postJson(app, "/login/code", { code });
    const guest = {
      cookie: `robkit_session=${sessionCookieOf(signIn)?.value ?? ""}`,
    };

    const answers = [
      await app.request("/codes", { headers: guest }),
      await postJson(app, "/codes", { name: "Eve" }, guest),
      await postJson(app, `/codes/${id}/revoke`, {}, guest),
    ];

    expect(answers.map((res) => res.status)).toEqual([404, 404, 404]);
    expect(await mintedCodes(app, owner)).toMatchObject([
      { name: "Gran", standing: "live" },
    ]);
  });

  it("let admin call them with the owner's cookie", async () => {
    const { app } = await freshCore();

    const res = await app.request("/codes", {
      method: "OPTIONS",
      headers: {
        origin: "https://admin.robkit.test",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://admin.robkit.test",
    );
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("renew the owner's expired token while the session lives", async () => {
    const { app, advance } = await freshCore();
    const owner = await claim(app);
    advance(16 * minute);

    const res = await listCodes(app, owner);

    expect(res.status).toBe(200);
    expect(sessionCookieOf(res)?.value).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
  });
});
