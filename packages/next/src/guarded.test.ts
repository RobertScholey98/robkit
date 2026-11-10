import {
  addressAnswer,
  addressCases,
  addressCookie,
  answerHeadersOf,
  aRoleId,
  callbackFor,
  conformanceAnswer,
  fakeCore,
  type FakeCore,
  guest,
  headerAnswer,
  headerCases,
  headerRequest,
  owner,
  printedOnExit,
  productionRun,
  refreshLocation,
  stubRun,
  testRuns,
  signedOutCookie,
  slug,
  stateIn,
  writeAnswer,
  writeCases,
  writeRequest,
} from "@internal/test-session";
import { conformanceCases } from "@robkit/guard/conformance";
import { orThrow, readCoreUrl } from "@robkit/input";
import { readSessionLapsed } from "@robkit/session/lapsed";
import { NextRequest } from "next/server.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { coreOrigin as originOfCore, guarded, viewer } from "./index.ts";
import {
  requestHeaders,
  servedWith,
  throughProxy,
} from "./test/next-request.ts";

vi.mock("next/headers.js", async () => {
  const { requestHeaders } = await import("./test/next-request.ts");
  return { headers: requestHeaders };
});

const example = slug("example");

/** `url` read as core's origin, for a test that names one. */
const coreOrigin = (url: string) =>
  orThrow(readCoreUrl({ ROBKIT_CORE_URL: url }));

// requestGuard's own tests cover the guard. These cover the Next glue: the
// guard's answer goes out as is, and pages, route handlers and server
// actions behind it read the viewer with viewer().

const navigate = { "sec-fetch-mode": "navigate" };

/** A page that shows who is asking. */
const showViewer = async () => Response.json(await viewer());

/**
 * Sends `url` through `proxy` to a page that shows the viewer. Next hands
 * the proxy a URL on its own host and port, and the Host header the dev
 * proxy or Traefik sent, so this does too.
 */
function ask(
  proxy: (request: Request) => Promise<Response>,
  url: string,
  init: { method?: string; headers?: Record<string, string> } = {},
  servePage: () => Promise<Response> = showViewer,
): Promise<Response> {
  const target = new URL(url);
  const request = new NextRequest(
    new URL(`${target.pathname}${target.search}`, "http://localhost:3001"),
    {
      method: init.method ?? "GET",
      headers: { host: target.host, ...init.headers },
    },
  );
  return throughProxy(proxy, request, servePage);
}

/** The value of each cookie `res` sets, as a `Cookie` header sends it. */
function cookieFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

describe("guarded", () => {
  it.each(conformanceCases)("$name", async (asking) => {
    const core = await fakeCore();
    const proxy = guarded({
      app: example,
      access: asking.rule,
      core: core.origin,
    });

    const res = await ask(proxy, core.page, {
      headers: { ...navigate, ...(await core.cookieFor(asking)) },
    });

    expect({
      status: res.status,
      location: res.headers.get("location"),
      viewer: res.status === 200 ? await res.json() : undefined,
    }).toEqual(conformanceAnswer(asking, core.page, core));
  });

  it("answers a call from the page with the guard's 401, body and all", async () => {
    const core = await fakeCore();
    const proxy = guarded({
      app: example,
      access: { kind: "owner" },
      core: core.origin,
    });

    const res = await ask(proxy, core.page, {
      method: "POST",
      headers: { "sec-fetch-mode": "cors" },
    });

    expect(await readSessionLapsed(res)).toEqual({
      outcome: "login",
      error: "Sign in to use this app.",
      location: `${core.hub}/`,
    });
    expect(res.headers.get("x-action-redirect")).toBeNull();
  });

  it("sends a server action from a page whose viewer must sign in to the hub, and back to the page", async () => {
    const core = await fakeCore();
    const proxy = guarded({
      app: example,
      access: { kind: "owner" },
      core: core.origin,
    });

    const res = await ask(proxy, core.page, {
      method: "POST",
      headers: { "sec-fetch-mode": "cors", "next-action": "7f00aa" },
    });

    const hub = new URL("/", core.hub);
    hub.searchParams.set("next", core.page);
    expect({
      lapsed: await readSessionLapsed(res),
      redirect: res.headers.get("x-action-redirect"),
    }).toEqual({
      lapsed: {
        outcome: "login",
        error: "Sign in to use this app.",
        location: `${core.hub}/`,
      },
      redirect: `${hub.href};push`,
    });
  });

  it("sends a server action whose token expired through the app's refresh, and back to the page", async () => {
    const core = await fakeCore();
    const proxy = guarded({
      app: example,
      access: { kind: "owner" },
      core: core.origin,
    });
    const expired = await core.key.token({ ageSeconds: 20 * 60 });

    const res = await ask(proxy, core.page, {
      method: "POST",
      headers: {
        "sec-fetch-mode": "cors",
        "next-action": "7f00aa",
        cookie: `robkit_session=${expired}`,
      },
    });

    expect(res.headers.get("x-action-redirect")).toBe(
      `${new URL("/_robkit/refresh", core.page).href}?next=${encodeURIComponent(core.page)};push`,
    );
  });

  it("keeps a server action on the app's origin when a request says https", async () => {
    const core = await fakeCore();
    const proxy = guarded({
      app: example,
      access: { kind: "owner" },
      core: core.origin,
    });
    const expired = await core.key.token({ ageSeconds: 20 * 60 });

    const res = await ask(proxy, core.page, {
      method: "POST",
      headers: {
        "sec-fetch-mode": "cors",
        "next-action": "7f00aa",
        "x-forwarded-proto": "https",
        cookie: `robkit_session=${expired}`,
      },
    });

    expect(res.headers.get("x-action-redirect")).toBe(
      `${new URL("/_robkit/refresh", core.page).href}?next=${encodeURIComponent(core.page)};push`,
    );
  });

  it("sends a lapsed server action to a page on the app's origin, whatever Host and X-Forwarded-Proto say", async () => {
    const core = await fakeCore();
    const proxy = guarded({
      app: example,
      access: { kind: "owner" },
      core: core.origin,
    });
    const { pathname, search } = new URL(core.page);
    // Next hands the proxy a URL on its own host and port.
    const action = (cookie: Record<string, string>) =>
      proxy(
        new NextRequest(`http://localhost:3001${pathname}${search}`, {
          method: "POST",
          headers: {
            host: "evil.com",
            "x-forwarded-host": "evil.com",
            "x-forwarded-proto": "https",
            "sec-fetch-mode": "cors",
            "next-action": "7f00aa",
            ...cookie,
          },
        }),
      );
    const expired = await core.key.token({ ageSeconds: 20 * 60 });

    const refresh = await action({ cookie: `robkit_session=${expired}` });
    const login = await action({});

    const back = encodeURIComponent(core.page);
    expect({
      refresh: refresh.headers.get("x-action-redirect"),
      login: login.headers.get("x-action-redirect"),
    }).toEqual({
      refresh: `${new URL("/_robkit/refresh", core.page).href}?next=${back};push`,
      login: `${core.hub}/?next=${back};push`,
    });
  });

  it("answers a server action from a guest without the role with the guard's 404 alone", async () => {
    const core = await fakeCore();
    const proxy = guarded({
      app: example,
      access: { kind: "roles", roles: [aRoleId("family")] },
      core: core.origin,
    });
    const token = await core.key.token({ holder: guest(["friends"]) });

    const res = await ask(proxy, core.page, {
      method: "POST",
      headers: {
        "sec-fetch-mode": "cors",
        "next-action": "7f00aa",
        cookie: `robkit_session=${token}`,
      },
    });

    expect([res.status, res.headers.get("x-action-redirect")]).toEqual([
      404,
      null,
    ]);
  });

  it("takes the app's token from core at the guard's callback, whatever routes the app has", async () => {
    const core = await fakeCore();
    const proxy = guarded({
      app: example,
      access: { kind: "owner" },
      core: core.origin,
    });
    const away = await ask(proxy, core.page, { headers: navigate });

    const back = await ask(
      proxy,
      callbackFor(core.page, {
        state: stateIn(away.headers.get("location")),
        token: await core.key.token(),
      }),
      { headers: { ...navigate, cookie: cookieFrom(away) } },
    );
    const res = await ask(proxy, core.page, {
      headers: { ...navigate, cookie: cookieFrom(back) },
    });

    expect([back.status, back.headers.get("location")]).toEqual([
      302,
      core.page,
    ]);
    expect(await res.json()).toEqual(owner);
  });

  it.each(addressCases)("$name", async (asking) => {
    const proxy = guarded({
      app: example,
      access: { kind: "owner" },
      core: coreOrigin(asking.core),
    });

    // Next hands the proxy a URL on its own host and port.
    const res = await proxy(
      new NextRequest(`http://localhost:3001${asking.target}`, {
        headers: { ...navigate, ...asking.headers, ...addressCookie(asking) },
      }),
    );

    expect({
      status: res.status,
      location: res.headers.get("location"),
    }).toEqual(addressAnswer(asking));
  });

  it.each(writeCases)("$name", async (asking) => {
    let reached = false;
    const proxy = guarded({
      app: example,
      access: { kind: "open" },
      core: coreOrigin(asking.core),
    });
    const { url, method, headers } = writeRequest(asking);

    const res = await ask(proxy, url, { method, headers }, () => {
      reached = true;
      return Promise.resolve(Response.json({}));
    });

    expect({ status: res.status, reached }).toEqual(writeAnswer(asking));
  });

  it.each(headerCases)("$name", async (asking) => {
    let reached = false;
    const { url, method, headers, access } = headerRequest(asking);
    const proxy = guarded({
      app: example,
      access,
      core: coreOrigin(asking.core),
    });

    const res = await ask(proxy, url, { method, headers }, () => {
      reached = true;
      return Promise.resolve(
        new URL(url).pathname === "/moved"
          ? Response.redirect(new URL("/", url), 302)
          : new Response("the app", {
              headers: { "content-security-policy": "default-src 'self'" },
            }),
      );
    });

    expect({
      status: res.status,
      reached,
      headers: answerHeadersOf(res.headers),
    }).toEqual(headerAnswer(asking));
  });

  it("sends a route handler's answer with the guard's X-Frame-Options, not its own", async () => {
    const proxy = guarded({
      app: example,
      access: { kind: "open" },
      core: coreOrigin("https://core.robkit.dev"),
    });

    const res = await ask(
      proxy,
      "https://example.robkit.dev/api/notes",
      {},
      () =>
        Promise.resolve(
          new Response("the app", {
            headers: {
              "x-frame-options": "DENY",
              "content-security-policy":
                "frame-ancestors 'self' https://hub.robkit.dev",
            },
          }),
        ),
    );

    expect(answerHeadersOf(res.headers)).toEqual({
      "x-frame-options": "SAMEORIGIN",
      "x-content-type-options": "nosniff",
      "strict-transport-security": "max-age=31536000",
      "content-security-policy":
        "frame-ancestors 'self' https://hub.robkit.dev",
    });
  });

  it("replaces a viewer the request came with by the guard's own", async () => {
    const core = await fakeCore();
    const proxy = guarded({
      app: example,
      access: { kind: "open" },
      core: core.origin,
    });
    // Even the owner's viewer, as the guard passed it on, is replaced.
    const passedOn = await ask(
      proxy,
      core.page,
      {
        headers: {
          ...navigate,
          cookie: `robkit_session=${await core.key.token()}`,
        },
      },
      async () => new Response((await requestHeaders()).get("robkit-viewer")),
    );

    const res = await ask(proxy, core.page, {
      headers: {
        ...navigate,
        cookie: signedOutCookie(core.origin),
        "robkit-viewer": await passedOn.text(),
      },
    });

    expect(await res.json()).toEqual({ kind: "nobody" });
  });
});

describe("viewer", () => {
  it("says the guard didn't run when the request has no viewer from it", async () => {
    await expect(servedWith(new Headers(), showViewer)).rejects.toThrow(
      "robkit's guard didn't run for this request, so it has no robkit-viewer header. Export guarded's proxy from src/proxy.ts, with a matcher that covers this path.",
    );
  });

  it("refuses a viewer that didn't come from this server's guard", async () => {
    const forged = Buffer.from(JSON.stringify(owner)).toString("base64url");

    await expect(
      servedWith(
        new Headers({ "robkit-viewer": `someone-elses-key.${forged}` }),
        showViewer,
      ),
    ).rejects.toThrow(
      "robkit's guard didn't run for this request, so it has no robkit-viewer header.",
    );
  });
});

describe("guarded(), reading its own settings", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("guards with ROBKIT_APP and ROBKIT_CORE_URL as it does when given them", async () => {
    const core = await fakeCore();
    core.rules.example = { kind: "owner" };
    vi.stubEnv("ROBKIT_APP", "example");
    vi.stubEnv("ROBKIT_CORE_URL", core.origin);
    const proxy = guarded();

    const signedIn = await ask(proxy, core.page, {
      headers: {
        ...navigate,
        cookie: `robkit_session=${await core.key.token()}`,
      },
    });
    const away = await ask(proxy, core.page, { headers: navigate });
    const action = await ask(proxy, core.page, {
      method: "POST",
      headers: {
        "sec-fetch-mode": "cors",
        "next-action": "7f00aa",
        cookie: `robkit_session=${await core.key.token({ ageSeconds: 20 * 60 })}`,
      },
    });

    expect([signedIn.status, await signedIn.json(), away.status]).toEqual([
      200,
      owner,
      302,
    ]);
    expect(action.headers.get("x-action-redirect")).toBe(
      `${new URL("/_robkit/refresh", core.page).href}?next=${encodeURIComponent(core.page)};push`,
    );
  });

  it("exits with the reader's message when a setting is unset or won't do", () => {
    vi.stubEnv("ROBKIT_APP", undefined);
    vi.stubEnv("ROBKIT_CORE_URL", "https://hub.robkit.dev");

    expect(printedOnExit(() => guarded())).toBe(
      [
        "ROBKIT_APP is not set. Run the app with pnpm dev, which sets it to the app's slug.",
        `ROBKIT_CORE_URL is "https://hub.robkit.dev", which isn't core's address. Set it to core's public origin, such as https://core.robkit.dev.`,
      ].join("\n"),
    );
  });

  it("takes the app and core as plain strings, and refuses a bad one the same way", async () => {
    const core = await fakeCore();
    const proxy = guarded({
      app: "example",
      core: String(core.origin),
      access: { kind: "owner" },
    });

    const res = await ask(proxy, core.page, {
      headers: {
        ...navigate,
        cookie: `robkit_session=${await core.key.token()}`,
      },
    });

    expect(await res.json()).toEqual(owner);
    expect(
      printedOnExit(() =>
        guarded({ app: "example", core: "http://core.example.com" }),
      ),
    ).toBe(
      `guarded()'s core is "http://core.example.com", which is http on a domain that isn't local. Serve the install over https and set it to https://core.example.com.`,
    );
  });
});

describe("guarded(), in a test run", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** How guarded()'s proxy answers a request with no session, as the env stands. */
  async function noSession(core: FakeCore) {
    vi.stubEnv("ROBKIT_APP", "example");
    vi.stubEnv("ROBKIT_CORE_URL", core.origin);
    let reached = false;
    const res = await ask(guarded(), core.page, { headers: navigate }, () => {
      reached = true;
      return Promise.resolve(new Response("served"));
    });
    return {
      status: res.status,
      location: res.headers.get("location"),
      reached,
    };
  }

  it.each(testRuns)(
    "sends a request with no session to core when $name, as in production",
    async ({ settings }) => {
      const core = await fakeCore();
      core.rules.example = { kind: "open" };

      stubRun(productionRun);
      const production = await noSession(core);
      stubRun(settings);
      const testRun = await noSession(core);

      const sentToCore = {
        status: 302,
        location: refreshLocation(core.page, core),
        reached: false,
      };
      expect([production, testRun]).toEqual([sentToCore, sentToCore]);
    },
  );
});

describe("coreOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is core's origin from ROBKIT_CORE_URL, for a page that shows it", () => {
    vi.stubEnv("ROBKIT_CORE_URL", "https://core.robkit.dev/");

    expect(originOfCore()).toBe("https://core.robkit.dev");
  });

  it("exits with the reader's message when ROBKIT_CORE_URL is unset", () => {
    vi.stubEnv("ROBKIT_CORE_URL", undefined);

    expect(printedOnExit(() => originOfCore())).toBe(
      "ROBKIT_CORE_URL is not set. Run the app with pnpm dev, which sets it, or set it to core's public origin, such as https://core.robkit.dev.",
    );
  });
});
