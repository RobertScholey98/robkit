import type { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { claim, freshCore, postJson, withSession } from "./test/fresh-app.ts";

const rob = { username: "rob", password: "correct horse battery" };
const wrong = { username: "rob", password: "not the password" };

const from = (client: string) => ({ "x-forwarded-for": client });

/** Mints a live code as the owner, claiming the install first. */
async function liveCode(app: Hono): Promise<string> {
  const owner = await claim(app);
  const res = await postJson(
    app,
    "/codes",
    { name: "Grandma" },
    withSession(owner),
  );
  return ((await res.json()) as { code: string }).code;
}

/** Each status, with how many responses had it. */
function tally(responses: Response[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const { status } of responses)
    counts[status] = (counts[status] ?? 0) + 1;
  return counts;
}

/** Sends `count` requests at once, as `send(i)` makes each. */
function burst(
  count: number,
  send: (i: number) => Promise<Response>,
): Promise<Response[]> {
  return Promise.all(Array.from({ length: count }, (_, i) => send(i)));
}

/** Sends `count` requests one after another, as `send(i)` makes each. */
async function inTurn(
  count: number,
  send: (i: number) => Promise<Response>,
): Promise<Response[]> {
  const responses = [];
  for (let i = 0; i < count; i++) responses.push(await send(i));
  return responses;
}

/** How many more wrong codes `client` may send before a 429. */
async function codePlacesLeft(app: Hono, client: string): Promise<number> {
  for (let left = 0; left <= 20; left++) {
    const res = await postJson(
      app,
      "/login/code",
      { code: "NOPE2" },
      from(client),
    );
    if (res.status === 429) return left;
  }
  throw new Error(`${client} was never refused`);
}

describe("a burst of sign-ins sent at once", () => {
  it("gets the owner's limit's worth of verdicts on /login, and 429 for the rest", async () => {
    const { app } = await freshCore();
    await claim(app);

    const responses = await burst(100, () =>
      postJson(app, "/login", wrong, from("203.0.113.7")),
    );

    expect(tally(responses)).toEqual({ 401: 5, 429: 95 });
  });

  it("gets the client's limit's worth of verdicts on /login/code, and 429 for the rest", async () => {
    const { app } = await freshCore();
    await liveCode(app);

    const responses = await burst(100, () =>
      postJson(app, "/login/code", { code: "NOPE2" }, from("203.0.113.7")),
    );

    expect(tally(responses)).toEqual({ 401: 10, 429: 90 });
  });

  it("signs in each right code that got a place, and frees only that place", async () => {
    const { app } = await freshCore();
    const code = await liveCode(app);
    const right = (i: number) => i % 4 === 0;

    const responses = await burst(20, (i) =>
      postJson(
        app,
        "/login/code",
        { code: right(i) ? code : "NOPE2" },
        from("203.0.113.7"),
      ),
    );
    const statuses = responses.map(({ status }) => status);
    const wrongVerdicts = statuses.filter((status) => status === 401).length;

    expect(
      statuses.filter((status) => status === 200 || status === 401),
    ).toHaveLength(10);
    statuses.forEach((status, i) => {
      expect(right(i) ? [200, 429] : [401, 429]).toContain(status);
    });
    expect(await codePlacesLeft(app, "203.0.113.7")).toBe(10 - wrongVerdicts);
  });
});

describe("a sign-in that gets no verdict", () => {
  it("leaves the client's limit as it was when the check throws", async () => {
    const { app, db } = await freshCore({ logError: () => undefined });
    await liveCode(app);
    await db.$client.end();

    const passwords = await inTurn(25, () =>
      postJson(app, "/login", rob, from("203.0.113.7")),
    );
    const codes = await inTurn(25, (i) =>
      postJson(
        app,
        "/login/code",
        { code: "NOPE2" },
        from(`203.0.113.${String(i % 2)}`),
      ),
    );

    expect(tally(passwords)).toEqual({ 500: 25 });
    expect(tally(codes)).toEqual({ 500: 25 });
  });

  it("leaves the client's limit as it was on an unclaimed install", async () => {
    const { app } = await freshCore();

    const passwords = await inTurn(25, () =>
      postJson(app, "/login", rob, from("203.0.113.7")),
    );
    const codes = await inTurn(25, (i) =>
      postJson(
        app,
        "/login/code",
        { code: "NOPE2" },
        from(`203.0.113.${String(i % 2)}`),
      ),
    );

    expect(tally(passwords)).toEqual({ 409: 25 });
    expect(tally(codes)).toEqual({ 409: 25 });
  });
});
