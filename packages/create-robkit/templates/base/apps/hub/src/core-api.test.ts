import { fakeCore, unreachable } from "@internal/core-client/fake-core";
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

/** Core with the owner `rob` and the code `k7xq2`, as far as sign-in goes. */
const signsIn = fakeCore(core, {
  "POST /setup": ({ body }) => ({
    status: 201,
    body: { state: "signed-in", profile: { ...owner, ...(body as object) } },
  }),
  "POST /login": ({ body }) =>
    JSON.stringify(body) === JSON.stringify(credentials)
      ? { body: { state: "signed-in", profile: owner } }
      : { status: 401, body: { error: "Wrong username or password." } },
  "POST /login/code": ({ body }) =>
    JSON.stringify(body) === JSON.stringify({ code: "k7xq2" })
      ? { body: { state: "signed-in", profile: guest } }
      : { status: 401, body: { error: "That code doesn't work." } },
  "POST /logout": () => new Response(null, { status: 204 }),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getSession", () => {
  it.each([
    [{ state: "unclaimed" }],
    [{ state: "signed-out" }],
    [{ state: "signed-in", profile: owner }],
    [{ state: "signed-in", profile: guest }],
  ])("reads %o", async (session) => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, { "GET /session": () => ({ body: session }) }),
    );

    expect(await getSession(core)).toEqual({ outcome: "ok", value: session });
  });

  it.each([
    ["an unknown state", { state: "sleeping" }],
    ["a profile that is nobody", { state: "signed-in", profile: {} }],
    [
      "a guest without a name",
      { state: "signed-in", profile: { kind: "guest", id: "c_1" } },
    ],
  ])("refuses %s", async (_, body) => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, { "GET /session": () => ({ body }) }),
    );

    expect(await getSession(core)).toEqual({
      outcome: "failed",
      error: "Core sent an answer this page can't read.",
    });
  });
});

describe("setUp", () => {
  it("sends the owner's credentials and reads the session", async () => {
    vi.stubGlobal("fetch", signsIn);

    const result = await setUp(core, { ...credentials, username: "ann" });

    expect(result).toEqual({
      outcome: "ok",
      value: {
        state: "signed-in",
        profile: { ...owner, username: "ann" },
      },
    });
  });

  it("passes on core's refusal once the install has an owner", async () => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, {
        "POST /setup": () => ({
          status: 409,
          body: { error: "This install already has an owner." },
        }),
      }),
    );

    expect(await setUp(core, credentials)).toEqual({
      outcome: "failed",
      error: "This install already has an owner.",
    });
  });
});

describe("signIn", () => {
  it("sends the credentials and reads the session", async () => {
    vi.stubGlobal("fetch", signsIn);

    expect(await signIn(core, credentials)).toEqual({
      outcome: "ok",
      value: { state: "signed-in", profile: owner },
    });
  });

  it("passes on a wrong password as core's sentence", async () => {
    vi.stubGlobal("fetch", signsIn);

    expect(await signIn(core, { ...credentials, password: "nope" })).toEqual({
      outcome: "failed",
      error: "Wrong username or password.",
    });
  });

  it("passes on rate limiting as core's sentence", async () => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, {
        "POST /login": () => ({
          status: 429,
          body: { error: "Too many attempts. Try again in a minute." },
        }),
      }),
    );

    expect(await signIn(core, credentials)).toEqual({
      outcome: "failed",
      error: "Too many attempts. Try again in a minute.",
    });
  });
});

describe("signInWithCode", () => {
  it("sends the code and reads the guest's session", async () => {
    vi.stubGlobal("fetch", signsIn);

    expect(await signInWithCode(core, "k7xq2")).toEqual({
      outcome: "ok",
      value: { state: "signed-in", profile: guest },
    });
  });

  it("passes on a refused code as core's sentence", async () => {
    vi.stubGlobal("fetch", signsIn);

    expect(await signInWithCode(core, "NOPE2")).toEqual({
      outcome: "failed",
      error: "That code doesn't work.",
    });
  });
});

describe("signOut", () => {
  it("leaves the hub signed out", async () => {
    vi.stubGlobal("fetch", signsIn);

    expect(await signOut(core)).toEqual({
      outcome: "ok",
      value: { state: "signed-out" },
    });
  });

  it("passes on core's refusal", async () => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, {
        "POST /logout": () => new Response("<html>", { status: 502 }),
      }),
    );

    expect(await signOut(core)).toEqual({
      outcome: "failed",
      error: "Core answered 502.",
    });
  });
});

describe("every call", () => {
  it.each([
    ["getSession", () => getSession(core)],
    ["setUp", () => setUp(core, credentials)],
    ["signIn", () => signIn(core, credentials)],
    ["signInWithCode", () => signInWithCode(core, "k7xq2")],
    ["signOut", () => signOut(core)],
  ])("%s says when core can't be reached", async (_, call) => {
    vi.stubGlobal("fetch", unreachable);

    expect(await call()).toEqual({
      outcome: "failed",
      error: "Couldn't reach core at https://core.example.com.",
    });
  });
});
