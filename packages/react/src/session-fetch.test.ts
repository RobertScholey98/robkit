import {
  sessionLapsedResponse,
  type SessionLapsed,
} from "@robkit/session/lapsed";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const page = "http://start.robkit.localhost:3000/notes?x=1";
const refresh: SessionLapsed = {
  outcome: "refresh",
  error: "Your session needs refreshing.",
  location: "http://start.robkit.localhost:3000/_robkit/refresh",
};
const login: SessionLapsed = {
  outcome: "login",
  error: "Sign in to use this app.",
  location: "http://hub.robkit.localhost:3000/",
};

/** The guard's answer to a call once the session has lapsed. */
const guardSays = (lapsed: SessionLapsed) => sessionLapsedResponse(lapsed);

/** The browser around the page: where it went, and its pageshow listeners. */
let visited: string[];
let pageshow: ((event: { persisted: boolean }) => void)[];

beforeEach(() => {
  visited = [];
  pageshow = [];
  vi.stubGlobal("location", {
    href: page,
    assign: (url: string) => visited.push(url),
  });
  vi.stubGlobal(
    "addEventListener",
    (type: string, listener: (event: { persisted: boolean }) => void) => {
      if (type === "pageshow") pageshow.push(listener);
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The app's server, answering every call with `answers` in turn. */
function serverAnswering(...answers: Response[]) {
  vi.stubGlobal("fetch", () => Promise.resolve(answers.shift()));
}

/** A fresh copy of the helper, as a newly loaded page has. */
async function freshSessionFetch(): Promise<typeof fetch> {
  vi.resetModules();
  return (await import("./index.ts")).sessionFetch;
}

const settled = (promise: Promise<unknown>) =>
  Promise.race([
    promise.then(
      () => "settled",
      () => "settled",
    ),
    new Promise((resolve) => setTimeout(resolve, 20, "pending")),
  ]);

describe("sessionFetch", () => {
  it("hands the caller an app's own error, body intact", async () => {
    const sessionFetch = await freshSessionFetch();
    serverAnswering(
      Response.json({ error: "That name is taken." }, { status: 409 }),
    );

    const res = await sessionFetch("/api/notes", { method: "POST" });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "That name is taken." });
    expect(visited).toEqual([]);
  });

  it("hands the caller a 401 that isn't the guard's", async () => {
    const sessionFetch = await freshSessionFetch();
    serverAnswering(new Response("Wrong PIN", { status: 401 }));

    const res = await sessionFetch("/api/unlock");

    expect([res.status, await res.text()]).toEqual([401, "Wrong PIN"]);
    expect(visited).toEqual([]);
  });

  it("hands the caller the app's own 401, even shaped like the guard's", async () => {
    const sessionFetch = await freshSessionFetch();
    const own = {
      error: "Ask the owner for this album.",
      location: "http://hub.robkit.localhost:3000/",
    };
    serverAnswering(Response.json(own, { status: 401 }));

    const res = await sessionFetch("/api/albums/1");

    expect([res.status, await res.json()]).toEqual([401, own]);
    expect(visited).toEqual([]);
  });

  it("sends the browser through its app's refresh and core, back to this page", async () => {
    const sessionFetch = await freshSessionFetch();
    serverAnswering(guardSays(refresh));

    const call = sessionFetch("/_serverFn/abc", { method: "POST" });

    expect(await settled(call)).toBe("pending");
    expect(visited).toEqual([
      `http://start.robkit.localhost:3000/_robkit/refresh?next=${encodeURIComponent(page)}`,
    ]);
  });

  it("sends the browser to log in when the session has ended", async () => {
    const sessionFetch = await freshSessionFetch();
    serverAnswering(guardSays(login));

    const call = sessionFetch("/api/notes");

    expect(await settled(call)).toBe("pending");
    expect(visited).toEqual([
      `http://hub.robkit.localhost:3000/?next=${encodeURIComponent(page)}`,
    ]);
  });

  it("leaves once when several calls find the session expired", async () => {
    const sessionFetch = await freshSessionFetch();
    serverAnswering(guardSays(refresh), guardSays(refresh), guardSays(login));

    const calls = [
      sessionFetch("/_serverFn/a"),
      sessionFetch("/_serverFn/b"),
      sessionFetch("/api/notes"),
    ];

    expect(await Promise.all(calls.map(settled))).toEqual([
      "pending",
      "pending",
      "pending",
    ]);
    expect(visited).toHaveLength(1);
  });

  describe("its deadline", () => {
    /** Stands in for AbortSignal.timeout, so a test says when time runs out. */
    let clock: AbortController;
    let limits: number[];
    /** What the app's server was asked, once a call reaches it. */
    let asked: { input: RequestInfo | URL; init: RequestInit | undefined }[];

    beforeEach(() => {
      clock = new AbortController();
      limits = [];
      asked = [];
      vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
        limits.push(ms);
        return clock.signal;
      });
      // A server that never answers: the call ends only when its signal
      // aborts. Like fetch, it takes init's signal over a Request's.
      vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
        asked.push({ input, init });
        const signal =
          init?.signal ?? (input instanceof Request ? input.signal : undefined);
        return new Promise((_, reject) => {
          signal?.addEventListener("abort", () => {
            reject(signal.reason as Error);
          });
        });
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("gives up on an app that doesn't answer in 30 seconds", async () => {
      const sessionFetch = await freshSessionFetch();

      const call = sessionFetch("/_serverFn/slow", { method: "POST" });
      clock.abort(new DOMException("Timed out.", "TimeoutError"));

      await expect(call).rejects.toMatchObject({ name: "TimeoutError" });
      expect(limits).toEqual([30_000]);
      expect(asked[0]?.init?.method).toBe("POST");
    });

    it("still stops when the caller's own signal aborts", async () => {
      const sessionFetch = await freshSessionFetch();
      const caller = new AbortController();

      const call = sessionFetch("/api/notes", { signal: caller.signal });
      caller.abort(new DOMException("Left the page.", "AbortError"));

      await expect(call).rejects.toMatchObject({ name: "AbortError" });
    });

    it("keeps the signal of a Request the caller passes", async () => {
      const sessionFetch = await freshSessionFetch();
      const caller = new AbortController();

      const call = sessionFetch(
        new Request("http://start.robkit.localhost:3000/api/notes", {
          signal: caller.signal,
        }),
      );
      caller.abort(new DOMException("Left the page.", "AbortError"));

      await expect(call).rejects.toMatchObject({ name: "AbortError" });
    });
  });

  it("leaves again once the browser brings the page back from its cache", async () => {
    const sessionFetch = await freshSessionFetch();
    serverAnswering(guardSays(refresh), guardSays(refresh));

    await settled(sessionFetch("/_serverFn/a"));
    for (const listener of pageshow) listener({ persisted: true });
    await settled(sessionFetch("/_serverFn/b"));

    expect(visited).toHaveLength(2);
  });
});
