import { afterEach, describe, expect, it, vi } from "vitest";
import { callCore } from "./call-core.ts";
import { fakeCore, unreachable } from "./fake-core.ts";

const core = "https://core.example.com";

const readName = (body: unknown) =>
  typeof body === "object" &&
  body !== null &&
  "name" in body &&
  typeof body.name === "string"
    ? body.name
    : undefined;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("callCore", () => {
  it("reads core's answer to a GET", async () => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, { "GET /me": () => ({ body: { name: "Grandma" } }) }),
    );

    expect(await callCore(core, "GET", "/me", { read: readName })).toEqual({
      ok: true,
      value: "Grandma",
    });
  });

  it("posts its body as JSON and reads the answer", async () => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, {
        "POST /greet": ({ body }) => ({ status: 201, body }),
      }),
    );

    expect(
      await callCore(core, "POST", "/greet", {
        body: { name: "Grandma" },
        read: readName,
      }),
    ).toEqual({ ok: true, value: "Grandma" });
  });

  it("sends the viewer's cookie, and the JSON type that makes the browser preflight", async () => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, {
        "POST /echo": ({ request }) => ({
          body: {
            credentials: request.credentials,
            type: request.headers.get("content-type"),
          },
        }),
      }),
    );

    expect(
      await callCore(core, "POST", "/echo", {
        body: {},
        read: (answer: unknown) => answer,
      }),
    ).toEqual({
      ok: true,
      value: { credentials: "include", type: "application/json" },
    });
  });

  it("answers with nothing when there's nothing to read", async () => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, {
        "POST /logout": () => new Response(null, { status: 204 }),
      }),
    );

    expect(await callCore(core, "POST", "/logout")).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("passes on core's error sentence", async () => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, {
        "POST /login": () => ({
          status: 401,
          body: { error: "Wrong username or password." },
        }),
      }),
    );

    expect(await callCore(core, "POST", "/login", { body: {} })).toEqual({
      ok: false,
      error: "Wrong username or password.",
    });
  });

  it("names the status when core fails without a sentence", async () => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, {
        "GET /me": () => new Response("<html>", { status: 502 }),
      }),
    );

    expect(await callCore(core, "GET", "/me", { read: readName })).toEqual({
      ok: false,
      error: "Core answered 502.",
    });
  });

  it("names the status of a path core doesn't have", async () => {
    vi.stubGlobal("fetch", fakeCore(core, {}));

    expect(await callCore(core, "GET", "/nowhere")).toEqual({
      ok: false,
      error: "Core answered 404.",
    });
  });

  it.each([
    ["an answer the reader refuses", { body: { name: 7 } }],
    ["no JSON at all", new Response("<html>")],
  ])("refuses %s", async (_, answer) => {
    vi.stubGlobal("fetch", fakeCore(core, { "GET /me": () => answer }));

    expect(await callCore(core, "GET", "/me", { read: readName })).toEqual({
      ok: false,
      error: "Core sent an answer this page can't read.",
    });
  });

  it("says when core can't be reached", async () => {
    vi.stubGlobal("fetch", unreachable);

    expect(await callCore(core, "GET", "/me", { read: readName })).toEqual({
      ok: false,
      error: "Couldn't reach core at https://core.example.com.",
    });
  });

  it("gives up on core when it doesn't answer in time", async () => {
    const signals: unknown[] = [];
    vi.stubGlobal("fetch", (_: unknown, init?: RequestInit) => {
      signals.push(init?.signal);
      return Promise.reject(
        new DOMException("The operation timed out.", "TimeoutError"),
      );
    });

    expect(await callCore(core, "GET", "/me", { read: readName })).toEqual({
      ok: false,
      error:
        "Core at https://core.example.com didn't answer in 10 seconds. Try again.",
    });
    expect(signals[0]).toBeInstanceOf(AbortSignal);
  });
});
