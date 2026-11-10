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

describe("createApp's signInLimits", () => {
  it("sets each client's limits and their window", async () => {
    const { app, advance } = await freshCore({
      signInLimits: {
        passwordsPerClient: 2,
        codesPerClient: 3,
        clientWindowMs: 60_000,
      },
    });
    await liveCode(app);

    const passwords = await inTurn(3, () =>
      postJson(app, "/login", wrong, from("203.0.113.7")),
    );
    const codes = await inTurn(4, () =>
      postJson(app, "/login/code", { code: "NOPE2" }, from("203.0.113.7")),
    );
    advance(60_000);
    const later = await postJson(app, "/login", rob, from("203.0.113.7"));

    expect(passwords.map(({ status }) => status)).toEqual([401, 401, 429]);
    expect(passwords[2]?.headers.get("retry-after")).toBe("60");
    expect(codes.map(({ status }) => status)).toEqual([401, 401, 401, 429]);
    expect(later.status).toBe(200);
  });
});

describe("the install's budget for wrong codes", () => {
  const hour = 60 * 60_000;

  /** Spends the budget with wrong codes, ten from each of two clients. */
  async function spendBudget(app: Hono): Promise<void> {
    const wrongs = await inTurn(20, (i) =>
      postJson(
        app,
        "/login/code",
        { code: "NOPE2" },
        from(`198.51.100.${String(i % 2)}`),
      ),
    );
    expect(tally(wrongs)).toEqual({ 401: 20 });
  }

  it("gives a burst of wrong codes from many clients no more verdicts than the budget", async () => {
    const { app } = await freshCore();
    await liveCode(app);

    const responses = await burst(100, (i) =>
      postJson(
        app,
        "/login/code",
        { code: "NOPE2" },
        from(`203.0.113.${String(i)}`),
      ),
    );

    expect(tally(responses)).toEqual({ 401: 20, 429: 80 });
  });

  it("refuses a right code from a fresh client once spent, until the window passes", async () => {
    const { app, advance } = await freshCore();
    const code = await liveCode(app);
    await spendBudget(app);

    const refused = await postJson(
      app,
      "/login/code",
      { code },
      from("203.0.113.7"),
    );
    advance(hour - 1000);
    const lastSecond = await postJson(
      app,
      "/login/code",
      { code },
      from("203.0.113.7"),
    );
    advance(1000);
    const later = await postJson(
      app,
      "/login/code",
      { code },
      from("203.0.113.7"),
    );

    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBe("3600");
    expect(await refused.json()).toEqual({
      error: "Too many attempts. Try again in 60 minutes.",
    });
    expect(lastSecond.headers.get("retry-after")).toBe("1");
    expect(later.status).toBe(200);
  });

  it("leaves the owner's password sign-in alone", async () => {
    const { app } = await freshCore();
    await liveCode(app);
    await spendBudget(app);

    const res = await postJson(app, "/login", rob, from("203.0.113.7"));

    expect(res.status).toBe(200);
  });

  it("leaves the limit of a client that held a place but found the budget spent as it was", async () => {
    const { app, advance } = await freshCore({
      signInLimits: { installWindowMs: 60_000 },
    });
    await liveCode(app);
    await inTurn(3, () =>
      postJson(app, "/login/code", { code: "NOPE2" }, from("203.0.113.7")),
    );
    await inTurn(17, (i) =>
      postJson(
        app,
        "/login/code",
        { code: "NOPE2" },
        from(`198.51.100.${String(i)}`),
      ),
    );

    const refused = await inTurn(12, () =>
      postJson(app, "/login/code", { code: "NOPE2" }, from("203.0.113.7")),
    );
    advance(60_000);

    expect(tally(refused)).toEqual({ 429: 12 });
    expect(await codePlacesLeft(app, "203.0.113.7")).toBe(7);
  });
});

describe("a full limit", () => {
  it("refuses a new client on /login/code, and keeps counting the clients it holds", async () => {
    const { app } = await freshCore({ signInLimits: { clientsTracked: 2 } });
    const code = await liveCode(app);
    await inTurn(10, () =>
      postJson(app, "/login/code", { code: "NOPE2" }, from("203.0.113.1")),
    );
    await postJson(app, "/login/code", { code: "NOPE2" }, from("203.0.113.2"));

    const newcomer = await postJson(
      app,
      "/login/code",
      { code },
      from("203.0.113.3"),
    );
    const limited = await postJson(
      app,
      "/login/code",
      { code },
      from("203.0.113.1"),
    );
    const held = await postJson(
      app,
      "/login/code",
      { code },
      from("203.0.113.2"),
    );

    expect(newcomer.status).toBe(429);
    expect(newcomer.headers.get("retry-after")).toBe("1");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("900");
    expect(held.status).toBe(200);
  });

  it("lets a new client sign in with the right password on /login, without counting it", async () => {
    const { app } = await freshCore({ signInLimits: { clientsTracked: 2 } });
    await claim(app);
    await postJson(app, "/login", wrong, from("203.0.113.1"));
    await postJson(app, "/login", wrong, from("203.0.113.2"));

    const wrongs = await inTurn(6, () =>
      postJson(app, "/login", wrong, from("203.0.113.3")),
    );
    const right = await postJson(app, "/login", rob, from("203.0.113.3"));

    expect(tally(wrongs)).toEqual({ 401: 6 });
    expect(right.status).toBe(200);
  });
});
