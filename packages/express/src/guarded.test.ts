import { once } from "node:events";
import { request, type OutgoingHttpHeaders } from "node:http";
import { connect, type AddressInfo } from "node:net";
import {
  addressAnswer,
  addressCases,
  addressCookie,
  callbackFor,
  conformanceAnswer,
  fakeCore,
  owner,
  stateIn,
  slug,
} from "@internal/test-session";
import { conformanceCases } from "@robkit/guard/conformance";
import { orThrow, readCoreUrl } from "@robkit/input";
import { readSessionLapsed } from "@robkit/session/lapsed";
import express, { type Express } from "express";
import { describe, expect, it, onTestFinished } from "vitest";
import { guarded, type GuardedResponse } from "./index.ts";

const example = slug("example");

// requestGuard's own tests cover the guard. These cover the Express glue:
// the guard's answer goes out as is, and handlers behind it read
// res.locals.viewer.

const navigate = { "sec-fetch-mode": "navigate" };

/**
 * Sends `url` to `app` on a loopback port, with the URL's host as the Host
 * header, as the dev proxy and Traefik do. Answers with a web `Response`.
 */
async function ask(
  app: Express,
  url: string,
  init: { method?: string; headers?: OutgoingHttpHeaders; body?: string } = {},
): Promise<Response> {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  onTestFinished(async () => {
    server.close();
    await once(server, "close");
  });
  const { port } = server.address() as AddressInfo;
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        method: init.method ?? "GET",
        path: `${target.pathname}${target.search}`,
        headers: { host: target.host, ...init.headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const headers = new Headers();
          for (const [name, value] of Object.entries(res.headers)) {
            for (const one of [value ?? []].flat()) headers.append(name, one);
          }
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode ?? 0,
              headers,
            }),
          );
        });
      },
    );
    req.on("error", reject);
    req.end(init.body);
  });
}

/**
 * Sends `target` on the request line to `app` over a plain socket, with
 * exactly `headers`, so a test can send what Node's client won't: a target
 * that starts with two slashes, or no Host. A request with no Host is
 * HTTP/1.0, since Node refuses an HTTP/1.1 one without it. Answers with the
 * status and the Location header.
 */
async function sendRaw(
  app: Express,
  target: string,
  headers: Record<string, string>,
): Promise<{ status: number; location: string | null }> {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  onTestFinished(async () => {
    server.close();
    await once(server, "close");
  });
  const socket = connect((server.address() as AddressInfo).port, "127.0.0.1");
  const version = "host" in headers ? "1.1" : "1.0";
  socket.end(
    [
      `GET ${target} HTTP/${version}`,
      ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
      "connection: close",
      "",
      "",
    ].join("\r\n"),
  );
  let reply = "";
  for await (const chunk of socket) reply += String(chunk);
  const [head = ""] = reply.split("\r\n\r\n");
  const [statusLine = "", ...lines] = head.split("\r\n");
  const location = lines.find((line) => /^location:/i.test(line));
  return {
    status: Number(statusLine.split(" ")[1]),
    location:
      location === undefined
        ? null
        : location.slice(location.indexOf(":") + 1).trim(),
  };
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
    const app = express()
      .use(guarded({ app: example, access: asking.rule, core: core.origin }))
      .get("/{*path}", (_req, res: GuardedResponse) => {
        res.json(res.locals.viewer);
      });

    const res = await ask(app, core.page, {
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
    const app = express()
      .use(
        guarded({
          app: example,
          access: { kind: "owner" },
          core: core.origin,
        }),
      )
      .post("/{*path}", (_req, res: GuardedResponse) => {
        res.json(res.locals.viewer);
      });

    const res = await ask(app, core.page, {
      method: "POST",
      headers: { "sec-fetch-mode": "cors" },
    });

    expect(await readSessionLapsed(res)).toEqual({
      outcome: "login",
      error: "Sign in to use this app.",
      location: `${core.hub}/`,
    });
  });

  it("takes the app's token from core at the guard's callback, whatever routes the app has", async () => {
    const core = await fakeCore();
    const app = express()
      .use(
        guarded({
          app: example,
          access: { kind: "owner" },
          core: core.origin,
        }),
      )
      .get("/notes", (_req, res: GuardedResponse) => {
        res.json(res.locals.viewer);
      });
    const away = await ask(app, core.page, { headers: navigate });

    const back = await ask(
      app,
      callbackFor(core.page, {
        state: stateIn(away.headers.get("location")),
        token: await core.key.token(),
      }),
      { headers: { ...navigate, cookie: cookieFrom(away) } },
    );
    const res = await ask(app, core.page, {
      headers: { ...navigate, cookie: cookieFrom(back) },
    });

    expect([back.status, back.headers.get("location")]).toEqual([
      302,
      core.page,
    ]);
    expect(await res.json()).toEqual(owner);
  });

  it.each(addressCases)("$name", async (asking) => {
    const app = express().use(
      guarded({
        app: example,
        access: { kind: "owner" },
        core: orThrow(readCoreUrl({ ROBKIT_CORE_URL: asking.core })),
      }),
    );

    const res = await sendRaw(app, asking.target, {
      ...navigate,
      ...asking.headers,
      ...addressCookie(asking),
    });

    expect(res).toEqual(addressAnswer(asking));
  });

  it("leaves the request's body for the app's handlers", async () => {
    const core = await fakeCore();
    const token = await core.key.token();
    const app = express()
      .use(
        guarded({
          app: example,
          access: { kind: "owner" },
          core: core.origin,
        }),
      )
      .use(express.json())
      .post("/notes", (req, res: GuardedResponse) => {
        res.json({ body: req.body as unknown, viewer: res.locals.viewer });
      });

    const res = await ask(app, core.page.replace("?x=1", ""), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `robkit_session=${token}`,
      },
      body: JSON.stringify({ text: "Buy milk" }),
    });

    expect(await res.json()).toEqual({
      body: { text: "Buy milk" },
      viewer: owner,
    });
  });
});
