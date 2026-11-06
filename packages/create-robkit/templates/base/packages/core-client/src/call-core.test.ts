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
  vi.restoreAllMocks();
});

/**
 * A `fetch` whose answer's headers arrive at once but whose body sends
 * `start` and then stalls, until the call's signal gives up on it.
 */
const stalledBody =
  (start: string): typeof fetch =>
  (_, init) => {
    const signal = init?.signal;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(start));
        signal?.addEventListener("abort", () => {
          controller.error(signal.reason);
        });
      },
    });
    return Promise.resolve(
      new Response(body, { headers: { "content-type": "application/json" } }),
    );
  };

/** Stands in for the call's deadline, so a test can pass it at once. */
function deadline(): () => void {
  const controller = new AbortController();
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
  return () => {
    controller.abort(
      new DOMException("The operation timed out.", "TimeoutError"),
    );
  };
}

describe("callCore", () => {
  it("reads core's answer to a GET", async () => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, { "GET /me": () => ({ body: { name: "Grandma" } }) }),
    );

    expect(await callCore(core, "GET", "/me", { read: readName })).toEqual({
      outcome: "ok",
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
    ).toEqual({ outcome: "ok", value: "Grandma" });
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
      outcome: "ok",
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
      outcome: "ok",
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
      outcome: "failed",
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
      outcome: "failed",
      error: "Core answered 502.",
    });
  });

  it("names the status of a path core doesn't have", async () => {
    vi.stubGlobal("fetch", fakeCore(core, {}));

    expect(await callCore(core, "GET", "/nowhere")).toEqual({
      outcome: "failed",
      error: "Core answered 404.",
    });
  });

  it.each([
    ["an answer the reader refuses", { body: { name: 7 } }],
    ["no JSON at all", new Response("<html>")],
  ])("refuses %s", async (_, answer) => {
    vi.stubGlobal("fetch", fakeCore(core, { "GET /me": () => answer }));

    expect(await callCore(core, "GET", "/me", { read: readName })).toEqual({
      outcome: "failed",
      error: "Core sent an answer this page can't read.",
    });
  });

  it("says when core can't be reached", async () => {
    vi.stubGlobal("fetch", unreachable);

    expect(await callCore(core, "GET", "/me", { read: readName })).toEqual({
      outcome: "failed",
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
      outcome: "failed",
      error:
        "Core at https://core.example.com didn't answer in 10 seconds. Try again.",
    });
    expect(signals[0]).toBeInstanceOf(AbortSignal);
  });

  it("gives up on core when its answer starts but never finishes", async () => {
    const pass = deadline();
    vi.stubGlobal("fetch", stalledBody('{"name": "Gr'));

    const calling = callCore(core, "GET", "/me", { read: readName });
    pass();

    expect(await calling).toEqual({
      outcome: "failed",
      error:
        "Core at https://core.example.com didn't answer in 10 seconds. Try again.",
    });
  });

  it("says when core's answer breaks off", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            pull(controller) {
              controller.error(new TypeError("network error"));
            },
          }),
        ),
      ),
    );

    expect(await callCore(core, "GET", "/me", { read: readName })).toEqual({
      outcome: "failed",
      error: "Couldn't reach core at https://core.example.com.",
    });
  });

  it("tells report what went wrong underneath", async () => {
    const pass = deadline();
    vi.stubGlobal("fetch", stalledBody("{"));
    const reported: unknown[][] = [];

    const calling = callCore(core, "GET", "/me", {
      read: readName,
      report: (message, cause) => reported.push([message, cause]),
    });
    pass();
    await calling;

    expect(reported).toEqual([
      [
        "Core at https://core.example.com didn't answer GET /me in 10 seconds.",
        new DOMException("The operation timed out.", "TimeoutError"),
      ],
    ]);
  });

  it("tells report when core's answer isn't JSON", async () => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, { "GET /me": () => new Response("<html>") }),
    );
    const reported: unknown[][] = [];

    await callCore(core, "GET", "/me", {
      read: readName,
      report: (message, cause) => reported.push([message, cause]),
    });

    expect(reported).toEqual([
      [
        "Core at https://core.example.com answered GET /me with something that isn't JSON.",
        expect.any(SyntaxError),
      ],
    ]);
  });
});
