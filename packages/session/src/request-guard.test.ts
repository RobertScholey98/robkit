import {
  aRoleId,
  callbackFor,
  conformanceAnswer,
  fakeCore,
  guest,
  owner,
  refreshLocation,
  signedOutCookie,
  signingKey,
  stateIn,
  type FakeCore,
  slug,
} from "@internal/test-session";
import type { AccessRule } from "@robkit/guard";
import type { CoreOrigin } from "@robkit/input";
import { conformanceCases } from "@robkit/guard/conformance";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import {
  appOrigin,
  requestGuard,
  type GuardedOptions,
  type GuardFault,
} from "./index.ts";
import { readSessionLapsed } from "./lapsed.ts";
import { coreOrigin } from "./test/core-origin.ts";

const example = slug("example");

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
  options: Omit<GuardedOptions, "core"> = {
    app: example,
    access: { kind: "owner" },
  },
) {
  const check = requestGuard({ ...options, core: core.origin });
  return async (url: string, init: RequestInit = {}) => {
    const decision = await check(new Request(url, init));
    return decision.outcome === "answer"
      ? decision.response
      : Response.json(decision.viewer);
  };
}

const cookie = (token: string) => ({ cookie: `robkit_session=${token}` });

/** The cookies a response sets, by name, each as its whole header. */
function setCookies(res: Response): Record<string, string> {
  return Object.fromEntries(
    res.headers
      .getSetCookie()
      .map((header): [string, string] => [header.split("=")[0] ?? "", header]),
  );
}

/** A cookie header sending what a response's set-cookie headers set. */
function cookiesFrom(...responses: Response[]): string {
  return responses
    .flatMap((res) => res.headers.getSetCookie())
    .map((header) => header.split(";")[0])
    .join("; ");
}

describe("appOrigin", () => {
  it("puts the app on core's protocol and port", () => {
    const notes = slug("notes");

    expect([
      appOrigin({ app: notes, core: coreOrigin("https://core.robkit.dev") }),
      appOrigin({
        app: notes,
        core: coreOrigin("http://core.robkit.localhost:3000"),
      }),
    ]).toEqual([
      "https://notes.robkit.dev",
      "http://notes.robkit.localhost:3000",
    ]);
  });
});

describe("requestGuard, on a page load", () => {
  it.each(conformanceCases)("$name", async (asking) => {
    const core = await fakeCore();
    const open = guardedBy(core, { app: example, access: asking.rule });

    const res = await open(core.page, {
      headers: { ...navigate, ...(await core.key.cookieFor(asking)) },
    });

    expect({
      status: res.status,
      location: res.headers.get("location"),
      viewer: res.status === 200 ? await res.json() : undefined,
    }).toEqual(conformanceAnswer(asking, core.page, core));
  });

  it("treats a token core didn't sign as no token", async () => {
    const core = await fakeCore();
    const forger = await signingKey();

    const res = await guardedBy(core)(core.page, {
      headers: { ...navigate, ...cookie(await forger.token()) },
    });

    expect([res.status, res.headers.get("location")]).toEqual([
      302,
      refreshLocation(core.page, core),
    ]);
  });

  it("tags what it decides: serve the viewer, or answer for the app", async () => {
    const core = await fakeCore();
    const check = requestGuard({
      app: example,
      access: { kind: "owner" },
      core: core.origin,
    });
    const signedIn = { ...navigate, ...cookie(await core.key.token()) };

    expect(await check(new Request(core.page, { headers: signedIn }))).toEqual({
      outcome: "serve",
      viewer: owner,
    });
    const away = await check(new Request(core.page, { headers: navigate }));
    expect(away.outcome === "answer" && away.response.status).toBe(302);
  });

  it("keeps the public scheme the proxy saw, and sets Secure cookies off localhost", async () => {
    const check = requestGuard({
      app: slug("notes"),
      access: { kind: "owner" },
      core: coreOrigin("https://core.example.com"),
    });

    const decision = await check(
      new Request("http://notes.example.com/", {
        headers: { ...navigate, "x-forwarded-proto": "https" },
      }),
    );

    const res = decision.outcome === "answer" ? decision.response : undefined;
    expect(res?.headers.get("location")).toEqual(
      refreshLocation("https://notes.example.com/", {
        origin: coreOrigin("https://core.example.com"),
      }),
    );
    expect(res?.headers.getSetCookie()).toEqual([
      expect.stringMatching(
        /^robkit_state=[\w-]{43}; Path=\/; Max-Age=600; HttpOnly; SameSite=Lax; Secure$/,
      ),
    ]);
  });

  it("sends a page load from a browser that sends no fetch metadata to log in, not round core", async () => {
    const core = await fakeCore();

    const res = await guardedBy(core)(core.page, {
      headers: { accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
    });

    expect([res.status, res.headers.get("location")]).toEqual([
      302,
      `${core.hub}/?next=${encodeURIComponent(core.page)}`,
    ]);
  });
});

describe("requestGuard, getting the app's token from core", () => {
  it("sends a page load it holds nothing for to core, keeping a state in a host-only cookie", async () => {
    const core = await fakeCore();

    const res = await guardedBy(core)(core.page, { headers: navigate });

    const state = stateIn(res.headers.get("location"));
    expect(res.status).toBe(302);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.getSetCookie()).toEqual([
      `robkit_state=${state}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax`,
    ]);
  });

  it("keeps the token core hands back in a host-only cookie, goes on to next, then lets the viewer in", async () => {
    const core = await fakeCore();
    const open = guardedBy(core);
    const away = await open(core.page, { headers: navigate });
    const token = await core.key.token();

    const back = await open(
      callbackFor(core.page, {
        state: stateIn(away.headers.get("location")),
        token,
      }),
      { headers: { ...navigate, cookie: cookiesFrom(away) } },
    );
    const later = await open(core.page, {
      headers: { ...navigate, cookie: cookiesFrom(away, back) },
    });

    expect(back.status).toBe(302);
    expect(back.headers.get("location")).toBe(core.page);
    expect(back.headers.get("cache-control")).toBe("no-store");
    expect(back.headers.get("referrer-policy")).toBe("no-referrer");
    expect(setCookies(back)).toEqual({
      robkit_session: `robkit_session=${token}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`,
    });
    expect([later.status, await later.json()]).toEqual([200, owner]);
  });

  it("keeps core's word that nobody is signed in: an open app lets them in, a gated one sends them to log in and forgets it", async () => {
    const core = await fakeCore();
    const asked = async (access: AccessRule) => {
      const open = guardedBy(core, { app: example, access });
      const away = await open(core.page, { headers: navigate });
      const back = await open(
        callbackFor(core.page, {
          state: stateIn(away.headers.get("location")),
        }),
        { headers: { ...navigate, cookie: cookiesFrom(away) } },
      );
      return {
        back,
        then: await open(core.page, {
          headers: { ...navigate, cookie: cookiesFrom(away, back) },
        }),
      };
    };

    const open = await asked({ kind: "open" });
    const gated = await asked({ kind: "owner" });

    expect(open.back.headers.getSetCookie()).toEqual([
      expect.stringMatching(
        /^robkit_session=signed-out\.\d+; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Lax$/,
      ),
    ]);
    expect([open.then.status, await open.then.json()]).toEqual([
      200,
      { kind: "nobody" },
    ]);
    expect([gated.then.status, gated.then.headers.get("location")]).toEqual([
      302,
      `${core.hub}/?next=${encodeURIComponent(core.page)}`,
    ]);
    expect(gated.then.headers.getSetCookie()).toEqual([
      "robkit_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
    ]);
  });

  it("asks core again once its word that nobody is signed in is a minute old", async () => {
    const core = await fakeCore();
    const open = guardedBy(core, { app: example, access: { kind: "open" } });
    const word = { cookie: signedOutCookie() };
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 61_000);

    const pageLoad = await open(core.page, {
      headers: { ...navigate, ...word },
    });
    const call = await open(core.page, {
      method: "POST",
      headers: { "sec-fetch-mode": "cors", ...word },
    });

    expect([pageLoad.status, pageLoad.headers.get("location")]).toEqual([
      302,
      refreshLocation(core.page, core),
    ]);
    expect([call.status, await call.json()]).toEqual([200, { kind: "nobody" }]);
  });

  it("reuses the state it holds, so two tabs on their way back both arrive", async () => {
    const core = await fakeCore();
    const open = guardedBy(core);
    const first = await open(core.page, { headers: navigate });
    const state = stateIn(first.headers.get("location"));

    const second = await open(core.page, {
      headers: { ...navigate, cookie: cookiesFrom(first) },
    });

    expect(stateIn(second.headers.get("location"))).toBe(state);
    expect(setCookies(second).robkit_state).toContain(`robkit_state=${state};`);
  });

  it.each([
    ["no state cookie", ""],
    [
      "another state",
      "robkit_state=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    ],
  ])(
    "refuses a token sent to its callback by a link the browser didn't start, with %s",
    async (_, held) => {
      const core = await fakeCore();
      const attacker = await core.key.token({ holder: guest(["family"]) });

      const res = await guardedBy(core)(
        callbackFor(core.page, {
          state: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
          token: attacker,
        }),
        { headers: { ...navigate, cookie: held } },
      );

      expect(res.status).toBe(400);
      expect(res.headers.getSetCookie()).toEqual([]);
    },
  );

  it.each([
    ["another app", "diary"],
    ["core", "core"],
  ])(
    "refuses at its callback a token core minted for %s",
    async (_, audience) => {
      const core = await fakeCore();
      const open = guardedBy(core);
      const away = await open(core.page, { headers: navigate });

      const res = await open(
        callbackFor(core.page, {
          state: stateIn(away.headers.get("location")),
          token: await core.key.token({ audience }),
        }),
        { headers: { ...navigate, cookie: cookiesFrom(away) } },
      );

      expect([res.status, await res.text()]).toEqual([
        400,
        "Core's token for this app doesn't check out.",
      ]);
      expect(res.headers.getSetCookie()).toEqual([]);
    },
  );

  it.each([
    ["another app", (port: string) => `http://diary.robkit.localhost:${port}/`],
    ["another site", () => "https://evil.com/"],
    [
      "the guard's own callback",
      (port: string) =>
        `http://example.robkit.localhost:${port}/_robkit/session`,
    ],
  ])("goes on only to a page on the same app, refusing %s", async (_, at) => {
    const core = await fakeCore();
    const next = at(new URL(core.origin).port);
    const open = guardedBy(core);
    const away = await open(core.page, { headers: navigate });

    const callback = new URL(
      callbackFor(core.page, {
        state: stateIn(away.headers.get("location")),
        token: await core.key.token(),
      }),
    );
    callback.searchParams.set("next", next);

    const back = await open(callback.href, {
      headers: { ...navigate, cookie: cookiesFrom(away) },
    });
    const refresh = await open(
      new URL(`/_robkit/refresh?next=${encodeURIComponent(next)}`, core.page)
        .href,
      { headers: navigate },
    );

    expect([back.status, refresh.status]).toEqual([400, 400]);
    expect(back.headers.getSetCookie()).toEqual([]);
  });

  it("stops at its callback, instead of going round again, when its clock runs ahead of core's", async () => {
    const core = await fakeCore();
    const open = guardedBy(core);
    const away = await open(core.page, { headers: navigate });

    const res = await open(
      callbackFor(core.page, {
        state: stateIn(away.headers.get("location")),
        token: await core.key.token({ ageSeconds: 20 * minute }),
      }),
      { headers: { ...navigate, cookie: cookiesFrom(away) } },
    );

    expect(res.status).toBe(503);
    expect(res.headers.getSetCookie()).toEqual([]);
  });
});

describe("requestGuard, on a call from the page or a server", () => {
  it("answers with the 401 the page reads as the guard's, leaving next to the page", async () => {
    const core = await fakeCore();
    const open = guardedBy(core);

    const loggedOut = await open(core.page, {
      headers: { "sec-fetch-mode": "cors" },
    });
    const expired = await open(core.page, {
      method: "POST",
      headers: cookie(await core.key.token({ ageSeconds: 20 * minute })),
    });

    expect(await readSessionLapsed(loggedOut)).toEqual({
      outcome: "login",
      error: "Sign in to use this app.",
      location: `${core.hub}/`,
    });
    expect(await readSessionLapsed(expired)).toEqual({
      outcome: "refresh",
      error: "Your session needs refreshing.",
      location: new URL("/_robkit/refresh", core.page).href,
    });
  });

  it("sends the browser the page sends to its refresh path through core and back to the page", async () => {
    const core = await fakeCore();
    const open = guardedBy(core);
    const expired = await open(core.page, {
      method: "POST",
      headers: cookie(await core.key.token({ ageSeconds: 20 * minute })),
    });
    const lapsed = await readSessionLapsed(expired);
    const leaveFor = new URL(lapsed?.location ?? "");
    leaveFor.searchParams.set("next", core.page);

    const away = await open(leaveFor.href, { headers: navigate });
    const back = await open(
      callbackFor(core.page, {
        state: stateIn(away.headers.get("location")),
        token: await core.key.token(),
      }),
      { headers: { ...navigate, cookie: cookiesFrom(away) } },
    );

    expect([away.status, away.headers.get("location")]).toEqual([
      302,
      refreshLocation(core.page, core),
    ]);
    expect([back.status, back.headers.get("location")]).toEqual([
      302,
      core.page,
    ]);
  });

  it("answers a server's JSON request with the guard's 401", async () => {
    const core = await fakeCore();

    const res = await guardedBy(core)(core.page, {
      headers: { accept: "application/json" },
    });

    expect(await readSessionLapsed(res)).toMatchObject({ outcome: "login" });
  });

  it("lets a server's call to an open app in as nobody, without sending it round core", async () => {
    const core = await fakeCore();

    const res = await guardedBy(core, {
      app: example,
      access: { kind: "open" },
    })(core.page, { headers: { accept: "application/json" } });

    expect([res.status, await res.json()]).toEqual([200, { kind: "nobody" }]);
  });
});

describe("requestGuard, with core's keys", () => {
  it("fetches core's key once, keeping core's Host, not on every request", async () => {
    const core = await fakeCore();
    const open = guardedBy(core);

    const viewers = [];
    for (let i = 0; i < 3; i++) {
      const res = await open(core.page, {
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
      refreshLocation(attacked, core),
    ]);
    expect(attacker.fetched).toEqual([]);
    expect(core.fetched).toHaveLength(1);
  });

  it("answers 503 when it can't fetch core's key, not a login redirect", async () => {
    const core = await fakeCore();
    core.status = 503;

    const res = await guardedBy(core)(core.page, {
      headers: { ...navigate, ...cookie(await core.key.token()) },
    });

    expect(res.status).toBe(503);
    expect(await res.text()).toBe("Can't reach core to check your session.");
  });

  it("keeps letting the owner in on a cached key once core stops answering", async () => {
    const core = await fakeCore();
    const open = guardedBy(core);
    const asOwner = async () =>
      open(core.page, {
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
  const family: AccessRule = { kind: "roles", roles: [aRoleId("family")] };

  it("lets in only the guests holding a role core gates the app to", async () => {
    const core = await fakeCore();
    core.rules.example = family;
    const open = guardedBy(core, { app: example });
    const asGuest = async (roles: string[]) =>
      open(core.page, {
        headers: {
          ...navigate,
          ...cookie(await core.key.token({ holder: guest(roles) })),
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
    const open = guardedBy(core, { app: example });

    const res = await open(core.page, {
      headers: {
        ...navigate,
        ...cookie(await core.key.token({ holder: guest(["family"]) })),
      },
    });

    expect(res.status).toBe(503);
    expect(await res.text()).toBe(
      "Can't reach core to check who may open this app.",
    );
  });
});

describe("requestGuard, when it can't check a request", () => {
  /** The guard's 503s on `core`, each with what it handed `onUnavailable`. */
  async function unavailable(core: FakeCore | { origin: CoreOrigin }) {
    const faults: GuardFault[] = [];
    const check = requestGuard({
      app: example,
      core: core.origin,
      onUnavailable: (fault) => faults.push(fault),
    });
    const key = "key" in core ? core.key : (await fakeCore()).key;
    const decision = await check(
      new Request(
        `http://example.robkit.localhost:${new URL(core.origin).port}/`,
        {
          headers: {
            ...navigate,
            ...cookie(await key.token({ holder: guest(["family"]) })),
          },
        },
      ),
    );
    const status =
      decision.outcome === "answer" ? decision.response.status : 200;
    return { status, faults };
  }

  const described = (fault: GuardFault | undefined) =>
    fault && {
      app: fault.app,
      failed: fault.failed,
      cause: fault.cause instanceof Error ? fault.cause.message : fault.cause,
    };

  it("names an app core doesn't know", async () => {
    const core = await fakeCore();

    const { status, faults } = await unavailable(core);

    expect(status).toBe(503);
    expect(faults.map(described)).toEqual([
      {
        app: "example",
        failed: "access-rule",
        cause: "Core doesn't know an app called example.",
      },
    ]);
  });

  it("names a rule core sent that isn't one", async () => {
    const core = await fakeCore();
    core.rules.example = { kind: "everyone" } as unknown as AccessRule;

    const { status, faults } = await unavailable(core);

    expect(status).toBe(503);
    expect(faults.map(described)).toEqual([
      {
        app: "example",
        failed: "access-rule",
        cause: "Core sent an access rule for example that isn't one.",
      },
    ]);
  });

  it("names core being down, and keeps the network's own error", async () => {
    const down = coreOrigin("http://core.robkit.localhost:1");

    const { status, faults } = await unavailable({ origin: down });

    expect(status).toBe(503);
    expect(faults.map(described)).toEqual([
      {
        app: "example",
        failed: "network",
        cause: `Can't reach core at ${down}.`,
      },
    ]);
    expect((faults[0]?.cause as Error).cause).toBeInstanceOf(Error);
  });

  it("says which way core's answer for the rule failed", async () => {
    const core = await fakeCore();

    const { faults } = await unavailable(core);

    expect(faults).toMatchObject([
      { failed: "access-rule", reason: "unknown-app" },
    ]);
  });

  it("names core being down when it loads the rule", async () => {
    const faults: GuardFault[] = [];
    const check = requestGuard({
      app: example,
      core: coreOrigin("http://core.robkit.localhost:1"),
      onUnavailable: (fault) => faults.push(fault),
    });

    // With no cookie, there is no token to check against core's key.
    const decision = await check(
      new Request("http://example.robkit.localhost:1/", { headers: navigate }),
    );

    expect(decision.outcome === "answer" && decision.response.status).toBe(503);
    expect(faults.map((fault) => fault.failed)).toEqual(["network"]);
  });

  it("names core's key when core answers but its key set won't load", async () => {
    const core = await fakeCore();
    core.status = 503;

    const { status, faults } = await unavailable(core);

    expect(status).toBe(503);
    expect(faults.map((fault) => fault.failed)).toEqual(["core-key"]);
  });

  it("logs the app, what failed and the cause when nothing is set", async () => {
    const core = await fakeCore();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    onTestFinished(() => {
      log.mockRestore();
    });
    const check = requestGuard({ app: example, core: core.origin });

    await check(
      new Request(core.page, {
        headers: {
          ...navigate,
          ...cookie(await core.key.token({ holder: guest(["family"]) })),
        },
      }),
    );

    expect(log).toHaveBeenCalledTimes(2);
    const [[line], [cause]] = log.mock.calls as unknown[][] as [
      [unknown],
      [unknown],
    ];
    expect(line).toBe(
      "robkit guard for example answered 503: couldn't load the app's access rule from core.",
    );
    expect(cause).toBeInstanceOf(Error);
    expect((cause as Error).message).toBe(
      "Core doesn't know an app called example.",
    );
  });
});
