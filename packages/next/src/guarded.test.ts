import {
  addressAnswer,
  addressCases,
  addressCookie,
  aRoleId,
  callbackFor,
  conformanceAnswer,
  fakeCore,
  guest,
  owner,
  signedOutCookie,
  slug,
  stateIn,
} from "@internal/test-session";
import { conformanceCases } from "@robkit/guard/conformance";
import { orThrow, readCoreUrl } from "@robkit/input";
import { readSessionLapsed } from "@robkit/session/lapsed";
import { NextRequest } from "next/server.js";
import { describe, expect, it, vi } from "vitest";
import { guarded, viewer } from "./index.ts";
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
      headers: { ...navigate, ...(await core.key.cookieFor(asking)) },
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
        cookie: signedOutCookie(),
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
