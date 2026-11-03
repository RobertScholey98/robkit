import {
  conformanceAnswer,
  fakeCore,
  guest,
  owner,
  signingKey,
  type FakeCore,
} from "@internal/test-session";
import type { AccessRule } from "@robkit/guard";
import { conformanceCases } from "@robkit/guard/conformance";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestGuard, type GuardedRule } from "./index.ts";

const page = "http://example.robkit.localhost:3000/notes?x=1";
const navigate = { "sec-fetch-mode": "navigate" };
const minute = 60;

afterEach(() => {
  vi.useRealTimers();
});

/**
 * What `requestGuard` answers `url` with, behind `core`: its response, or
 * the viewer as JSON when it lets the request through.
 */
function guardedBy(
  core: FakeCore,
  rule: GuardedRule = { access: { kind: "owner" } },
) {
  const check = requestGuard({ ...rule, core: core.origin });
  return async (url: string, init: RequestInit = {}) => {
    const decision = await check(new Request(url, init));
    return "response" in decision
      ? decision.response
      : Response.json(decision.viewer);
  };
}

const cookie = (token: string) => ({ cookie: `robkit_session=${token}` });

/** Where the guard sends a visitor to log in, and to refresh, from `url`. */
function elsewhere(core: FakeCore, url = page) {
  const next = `?next=${encodeURIComponent(url)}`;
  const hub = core.origin.replace("//core.", "//hub.");
  return { login: `${hub}/${next}`, refresh: `${core.origin}/refresh${next}` };
}

describe("requestGuard, on a page load", () => {
  it.each(conformanceCases)("$name", async (asking) => {
    const core = await fakeCore();
    const open = guardedBy(core, { access: asking.rule });

    const res = await open(page, {
      headers: { ...navigate, ...(await core.key.cookieFor(asking)) },
    });

    expect({
      status: res.status,
      location: res.headers.get("location"),
      viewer: res.status === 200 ? await res.json() : undefined,
    }).toEqual(conformanceAnswer(asking, page, core.origin));
  });

  it("treats a token core didn't sign as no token", async () => {
    const core = await fakeCore();
    const forger = await signingKey();

    const res = await guardedBy(core)(page, {
      headers: { ...navigate, ...cookie(await forger.token()) },
    });

    expect([res.status, res.headers.get("location")]).toEqual([
      302,
      elsewhere(core).login,
    ]);
  });

  it("keeps the public scheme the proxy saw", async () => {
    const check = requestGuard({
      access: { kind: "owner" },
      core: "https://core.example.com",
    });

    const decision = await check(
      new Request("http://notes.example.com/", {
        headers: { ...navigate, "x-forwarded-proto": "https" },
      }),
    );

    const location =
      "response" in decision ? decision.response.headers.get("location") : null;
    expect(location).toBe(
      `https://hub.example.com/?next=${encodeURIComponent("https://notes.example.com/")}`,
    );
  });

  it("redirects a page load from a browser that sends no fetch metadata", async () => {
    const core = await fakeCore();

    const res = await guardedBy(core)(page, {
      headers: { accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
    });

    expect([res.status, res.headers.get("location")]).toEqual([
      302,
      elsewhere(core).login,
    ]);
  });
});

describe("requestGuard, on a call from the page or a server", () => {
  it("answers 401 and where to go, not a redirect", async () => {
    const core = await fakeCore();
    const open = guardedBy(core);

    const loggedOut = await open(page, {
      headers: { "sec-fetch-mode": "cors" },
    });
    const expired = await open(page, {
      method: "POST",
      headers: cookie(await core.key.token(20 * minute)),
    });

    expect(loggedOut.status).toBe(401);
    expect(await loggedOut.json()).toEqual({
      error: "Sign in to use this app.",
      location: elsewhere(core).login,
    });
    expect(expired.status).toBe(401);
    expect(await expired.json()).toEqual({
      error: "Your session needs refreshing.",
      location: elsewhere(core).refresh,
    });
  });

  it("marks its 401 so the page can tell it from the app's own", async () => {
    const core = await fakeCore();
    const open = guardedBy(core);

    const loggedOut = await open(page, {
      headers: { "sec-fetch-mode": "cors" },
    });
    const expired = await open(page, {
      method: "POST",
      headers: cookie(await core.key.token(20 * minute)),
    });

    expect([
      loggedOut.headers.get("robkit-session"),
      expired.headers.get("robkit-session"),
    ]).toEqual(["login", "refresh"]);
  });

  it("answers a server's JSON request with 401", async () => {
    const core = await fakeCore();

    const res = await guardedBy(core)(page, {
      headers: { accept: "application/json" },
    });

    expect(res.status).toBe(401);
  });
});

describe("requestGuard, with core's keys", () => {
  it("fetches core's key once, keeping core's Host, not on every request", async () => {
    const core = await fakeCore();
    const open = guardedBy(core);

    const viewers = [];
    for (let i = 0; i < 3; i++) {
      const res = await open(page, {
        headers: { ...navigate, ...cookie(await core.key.token()) },
      });
      viewers.push(await res.json());
    }

    expect(viewers).toEqual([owner, owner, owner]);
    expect(core.fetched).toEqual([
      `${new URL(core.origin).host} /.well-known/jwks.json`,
    ]);
  });

  it("checks tokens against the configured core, whatever port the Host names", async () => {
    const [core, attacker] = await Promise.all([fakeCore(), fakeCore()]);
    const attacked = `http://example.robkit.localhost:${new URL(attacker.origin).port}/`;

    const res = await guardedBy(core)(attacked, {
      headers: { ...navigate, ...cookie(await attacker.key.token()) },
    });

    expect([res.status, res.headers.get("location")]).toEqual([
      302,
      elsewhere(core, attacked).login,
    ]);
    expect(attacker.fetched).toEqual([]);
    expect(core.fetched).toHaveLength(1);
  });

  it("answers 503 when it can't fetch core's key, not a login redirect", async () => {
    const core = await fakeCore();
    core.status = 503;

    const res = await guardedBy(core)(page, {
      headers: { ...navigate, ...cookie(await core.key.token()) },
    });

    expect(res.status).toBe(503);
    expect(await res.text()).toBe("Can't reach core to check your session.");
  });

  it("keeps letting the owner in on a cached key once core stops answering", async () => {
    const core = await fakeCore();
    const open = guardedBy(core);
    const asOwner = async () =>
      open(page, {
        headers: { ...navigate, ...cookie(await core.key.token()) },
      });
    const first = await asOwner();
    core.status = 503;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 60 * 60_000);

    const later = await asOwner();

    expect([first.status, later.status]).toEqual([200, 200]);
    expect(await later.json()).toEqual(owner);
    expect(core.fetched).toHaveLength(1);
  });
});

describe("requestGuard, with its rule in core", () => {
  const family: AccessRule = { kind: "roles", roles: ["family"] };

  it("lets in only the guests holding a role core gates the app to", async () => {
    const core = await fakeCore();
    core.rules.example = family;
    const open = guardedBy(core, { app: "example" });
    const asGuest = async (roles: string[]) =>
      open(page, {
        headers: {
          ...navigate,
          ...cookie(await core.key.token(0, guest(roles))),
        },
      });

    const inFamily = await asGuest(["family"]);
    const friends = await asGuest(["friends"]);

    expect([inFamily.status, friends.status]).toEqual([200, 404]);
    expect(await inFamily.json()).toEqual(guest(["family"]));
    expect(core.fetched.filter((f) => f.endsWith("/access"))).toEqual([
      `${new URL(core.origin).host} /apps/example/access`,
    ]);
  });

  it("answers 503 when it can't load its rule, not a 404", async () => {
    const core = await fakeCore();
    const open = guardedBy(core, { app: "example" });

    const res = await open(page, {
      headers: {
        ...navigate,
        ...cookie(await core.key.token(0, guest(["family"]))),
      },
    });

    expect(res.status).toBe(503);
    expect(await res.text()).toBe(
      "Can't reach core to check who may open this app.",
    );
  });
});

describe("requestGuard's options", () => {
  it("refuses a core origin that isn't core.<domain>", () => {
    expect(() =>
      requestGuard({
        access: { kind: "owner" },
        core: "http://localhost:3000",
      }),
    ).toThrow(
      "core must be core's public origin, such as http://core.robkit.localhost:3000, not http://localhost:3000",
    );
  });
});
