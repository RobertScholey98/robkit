import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSession,
  setUp,
  signIn,
  signInWithCode,
  signOut,
} from "./core-api.ts";

const core = "https://core.example.com";
const owner = { kind: "owner", id: "o_1", username: "rob" } as const;
const guest = { kind: "guest", id: "c_1", name: "Grandma" } as const;
const credentials = { username: "rob", password: "correct horse battery" };

function coreAnswers(status: number, body?: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
      }),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function postedTo(path: string, body?: unknown) {
  return [
    `${core}${path}`,
    {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    },
  ];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getSession", () => {
  it.each([
    [{ state: "unclaimed" }],
    [{ state: "signed-out" }],
    [{ state: "signed-in", viewer: owner }],
    [{ state: "signed-in", viewer: guest }],
  ])("reads %o", async (session) => {
    const fetch = coreAnswers(200, session);

    expect(await getSession(core)).toEqual({ ok: true, session });
    expect(fetch.mock.calls).toEqual([
      [`${core}/session`, { method: "GET", credentials: "include" }],
    ]);
  });

  it("turns a network failure into an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );

    expect(await getSession(core)).toEqual({
      ok: false,
      error: "Couldn't reach core at https://core.example.com.",
    });
  });

  it("names the status when core fails without an error sentence", async () => {
    coreAnswers(502);

    expect(await getSession(core)).toEqual({
      ok: false,
      error: "Core answered 502.",
    });
  });

  it.each([
    ["an unknown state", { state: "sleeping" }],
    ["a viewer that is nobody", { state: "signed-in", viewer: {} }],
    [
      "a guest without a name",
      { state: "signed-in", viewer: { kind: "guest", id: "c_1" } },
    ],
    ["no JSON at all", "<html>"],
  ])("refuses %s", async (_, body) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(typeof body === "string" ? body : JSON.stringify(body)),
        ),
      ),
    );

    expect(await getSession(core)).toEqual({
      ok: false,
      error: "Core sent an answer the hub can't read.",
    });
  });
});

describe("setUp", () => {
  it("posts the owner's credentials and reads the session", async () => {
    const fetch = coreAnswers(201, { state: "signed-in", viewer: owner });

    expect(await setUp(core, credentials)).toEqual({
      ok: true,
      session: { state: "signed-in", viewer: owner },
    });
    expect(fetch.mock.calls).toEqual([postedTo("/setup", credentials)]);
  });

  it("passes on core's refusal once the install has an owner", async () => {
    coreAnswers(409, { error: "This install already has an owner." });

    expect(await setUp(core, credentials)).toEqual({
      ok: false,
      error: "This install already has an owner.",
    });
  });
});

describe("signIn", () => {
  it("posts the credentials and reads the session", async () => {
    const fetch = coreAnswers(200, { state: "signed-in", viewer: owner });

    expect(await signIn(core, credentials)).toEqual({
      ok: true,
      session: { state: "signed-in", viewer: owner },
    });
    expect(fetch.mock.calls).toEqual([postedTo("/login", credentials)]);
  });

  it("passes on a wrong password as core's sentence", async () => {
    coreAnswers(401, { error: "Wrong username or password." });

    expect(await signIn(core, credentials)).toEqual({
      ok: false,
      error: "Wrong username or password.",
    });
  });

  it("passes on rate limiting as core's sentence", async () => {
    coreAnswers(429, { error: "Too many attempts. Try again in a minute." });

    expect(await signIn(core, credentials)).toEqual({
      ok: false,
      error: "Too many attempts. Try again in a minute.",
    });
  });
});

describe("signInWithCode", () => {
  it("posts the code and reads the guest's session", async () => {
    const fetch = coreAnswers(200, { state: "signed-in", viewer: guest });

    expect(await signInWithCode(core, "k7xq2")).toEqual({
      ok: true,
      session: { state: "signed-in", viewer: guest },
    });
    expect(fetch.mock.calls).toEqual([
      postedTo("/login/code", { code: "k7xq2" }),
    ]);
  });

  it("passes on a refused code as core's sentence", async () => {
    coreAnswers(401, { error: "That code doesn't work." });

    expect(await signInWithCode(core, "NOPE2")).toEqual({
      ok: false,
      error: "That code doesn't work.",
    });
  });
});

describe("signOut", () => {
  it("posts to logout and leaves the hub signed out", async () => {
    const fetch = coreAnswers(204);

    expect(await signOut(core)).toEqual({
      ok: true,
      session: { state: "signed-out" },
    });
    expect(fetch.mock.calls).toEqual([postedTo("/logout")]);
  });

  it("turns a network failure into an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError())),
    );

    expect(await signOut(core)).toEqual({
      ok: false,
      error: "Couldn't reach core at https://core.example.com.",
    });
  });
});
