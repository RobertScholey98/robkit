import {
  sessionLapsedResponse,
  type SessionLapsed,
} from "@robkit/session/lapsed";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const page = "http://start.robkit.localhost:3000/notes?x=1";
const refresh: SessionLapsed = {
  outcome: "refresh",
  error: "Your session needs refreshing.",
  location: `http://core.robkit.localhost:3000/refresh?next=${encodeURIComponent("http://start.robkit.localhost:3000/_serverFn/abc")}`,
};
const login: SessionLapsed = {
  outcome: "login",
  error: "Sign in to use this app.",
  location: `http://hub.robkit.localhost:3000/?next=${encodeURIComponent("http://start.robkit.localhost:3000/api/notes")}`,
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

  it("sends the browser through core's refresh and back to this page", async () => {
    const sessionFetch = await freshSessionFetch();
    serverAnswering(guardSays(refresh));

    const call = sessionFetch("/_serverFn/abc", { method: "POST" });

    expect(await settled(call)).toBe("pending");
    expect(visited).toEqual([
      `http://core.robkit.localhost:3000/refresh?next=${encodeURIComponent(page)}`,
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

  it("leaves again once the browser brings the page back from its cache", async () => {
    const sessionFetch = await freshSessionFetch();
    serverAnswering(guardSays(refresh), guardSays(refresh));

    await settled(sessionFetch("/_serverFn/a"));
    for (const listener of pageshow) listener({ persisted: true });
    await settled(sessionFetch("/_serverFn/b"));

    expect(visited).toHaveLength(2);
  });
});
