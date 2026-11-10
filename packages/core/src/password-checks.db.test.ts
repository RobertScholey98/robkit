import type { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { claim, freshCore, postJson } from "./test/fresh-app.ts";
import { heldUntil, type ScryptGate } from "./test/scrypt-gate.ts";

// A slow fake in scrypt's place, so a test can count the checks running at
// once and hold some until it lets them go.
const gate = vi.hoisted((): ScryptGate => ({
  running: 0,
  most: 0,
  hold: undefined,
  failNext: undefined,
}));
vi.mock("node:crypto", async (importOriginal) => {
  const crypto = await importOriginal<typeof import("node:crypto")>();
  const { gatedScrypt } = await import("./test/scrypt-gate.ts");
  return { ...crypto, scrypt: gatedScrypt(crypto.scrypt, gate) };
});

afterEach(() => {
  gate.hold = undefined;
  gate.most = 0;
});

const rob = { username: "rob", password: "correct horse battery" };
const wrong = { username: "rob", password: "not the password" };
const minute = 60_000;

const from = (client: string) => ({ "x-forwarded-for": client });

/** Holds every check of `password`, or of any password, until released. */
function hold(password?: string): () => void {
  const { held, release } = heldUntil();
  gate.hold = (tried) =>
    password === undefined || tried === password ? held : undefined;
  return release;
}

/** Waits until `count` checks are running. */
async function checksRunning(count: number): Promise<void> {
  await vi.waitFor(() => {
    expect(gate.running).toBe(count);
  });
}

/** Each response's status, in order. */
async function statusesOf(requests: Promise<Response>[]): Promise<number[]> {
  return (await Promise.all(requests)).map(({ status }) => status);
}

/** Sends `count` wrong passwords from `client`, one after another. */
async function wrongInTurn(
  app: Hono,
  count: number,
  client: string,
): Promise<Response[]> {
  const responses = [];
  for (let i = 0; i < count; i++) {
    responses.push(await postJson(app, "/login", wrong, from(client)));
  }
  return responses;
}

describe("the cap on password checks", () => {
  it("runs no more than 2 hashes at once on /setup", async () => {
    const { app } = await freshCore();
    const release = hold();

    const setups = Array.from({ length: 6 }, () =>
      postJson(app, "/setup", rob),
    );
    await checksRunning(2);
    release();
    const statuses = await statusesOf(setups);

    expect(gate.most).toBe(2);
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(5);
  });

  it("runs no more than 2 checks at once on /login, and refuses with 429 once the queue is full", async () => {
    const { app } = await freshCore();
    await claim(app);
    const release = hold();

    const logins = Array.from({ length: 12 }, (_, i) =>
      postJson(app, "/login", wrong, from(`203.0.113.${String(i)}`)),
    );
    await checksRunning(2);
    release();
    const responses = await Promise.all(logins);
    const refused = responses.filter(({ status }) => status === 429);

    expect(gate.most).toBe(2);
    expect(responses.filter(({ status }) => status === 401)).toHaveLength(10);
    expect(refused).toHaveLength(2);
    for (const res of refused) {
      expect(res.headers.get("retry-after")).toBe("1");
      expect(await res.json()).toEqual({
        error: "Too many attempts. Try again in 1 second.",
      });
    }
  });

  it("gives /setup the same 429 once the queue is full", async () => {
    const { app } = await freshCore({
      signInLimits: { passwordChecksAtOnce: 1, passwordChecksWaiting: 0 },
    });
    const release = hold();

    const first = postJson(app, "/setup", rob);
    await checksRunning(1);
    const second = await postJson(app, "/setup", rob);
    release();

    expect((await first).status).toBe(201);
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBe("1");
  });

  it("leaves the limit of a client refused for a full queue as it was", async () => {
    const { app } = await freshCore({
      signInLimits: { passwordChecksAtOnce: 1, passwordChecksWaiting: 0 },
    });
    await claim(app);
    const release = hold();

    const running = postJson(app, "/login", wrong, from("198.51.100.1"));
    await checksRunning(1);
    const refused = await postJson(app, "/login", wrong, from("203.0.113.7"));
    release();
    await running;
    gate.hold = undefined;
    const after = await wrongInTurn(app, 6, "203.0.113.7");

    expect(refused.status).toBe(429);
    expect(after.map(({ status }) => status)).toEqual([
      401, 401, 401, 401, 401, 429,
    ]);
  });
});

describe("password attempts still being checked", () => {
  it("ask the client that holds every place to come back in 1 second", async () => {
    const { app } = await freshCore();
    await claim(app);
    const release = hold();

    const pending = Array.from({ length: 5 }, () =>
      postJson(app, "/login", wrong, from("203.0.113.7")),
    );
    await checksRunning(2);
    const refused = await postJson(app, "/login", rob, from("203.0.113.7"));
    release();
    await Promise.all(pending);

    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBe("1");
    expect(await refused.json()).toEqual({
      error: "Too many attempts. Try again in 1 second.",
    });
  });

  it("keep their places when the right password lands first, and each is recorded on its verdict", async () => {
    const { app } = await freshCore({
      signInLimits: { passwordChecksAtOnce: 4 },
    });
    await claim(app);
    const release = hold(wrong.password);

    const pending = Array.from({ length: 3 }, () =>
      postJson(app, "/login", wrong, from("203.0.113.7")),
    );
    await checksRunning(3);
    const right = await postJson(app, "/login", rob, from("203.0.113.7"));
    release();
    const verdicts = await statusesOf(pending);
    gate.hold = undefined;
    const after = await wrongInTurn(app, 3, "203.0.113.7");

    expect(right.status).toBe(200);
    expect(verdicts).toEqual([401, 401, 401]);
    expect(after.map(({ status }) => status)).toEqual([401, 401, 429]);
  });

  it("count once each, from when the verdict arrives, even after the window they were reserved in", async () => {
    const { app, advance } = await freshCore();
    await claim(app);
    await wrongInTurn(app, 4, "203.0.113.7");
    const release = hold();

    const late = postJson(app, "/login", wrong, from("203.0.113.7"));
    await checksRunning(1);
    advance(15 * minute);
    release();
    const verdict = await late;
    gate.hold = undefined;
    const after = await wrongInTurn(app, 5, "203.0.113.7");

    expect(verdict.status).toBe(401);
    expect(after.map(({ status }) => status)).toEqual([
      401, 401, 401, 401, 429,
    ]);
    expect(after[4]?.headers.get("retry-after")).toBe("900");
  });
});
