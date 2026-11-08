import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { AccessRuleError, coreAccess } from "./core-access.ts";
import { CoreUnreachableError } from "./loopback-fetch.ts";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(async (server) => {
      server.close();
      await once(server, "close");
    }),
  );
});

/** Core's access endpoint on a loopback port, recording each request. */
async function fakeCore() {
  const requests: string[] = [];
  const answer: {
    status: number;
    body: unknown;
    /** A body sent as it is, rather than as JSON. */
    raw?: string;
    /** Whether the connection drops part way through the body. */
    cutOff?: boolean;
  } = {
    status: 200,
    body: { kind: "owner" },
  };
  const server = createServer((req, res) => {
    requests.push(`${String(req.headers.host)} ${String(req.url)}`);
    res.writeHead(answer.status, { "content-type": "application/json" });
    const body = answer.raw ?? JSON.stringify(answer.body);
    if (answer.cutOff) res.write(body.slice(0, 5), () => res.destroy());
    else res.end(body);
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://core.robkit.localhost:${String(port)}`,
    port,
    requests,
    answer,
  };
}

describe("coreAccess", () => {
  it("reads the app's rule from core through a *.localhost name", async () => {
    const { origin, port, requests, answer } = await fakeCore();
    answer.body = { kind: "roles", roles: ["role-1"] };

    const rule = await coreAccess(origin, "example")();

    expect(rule).toEqual({ kind: "roles", roles: ["role-1"] });
    expect(requests).toEqual([
      `core.robkit.localhost:${String(port)} /apps/example/access`,
    ]);
  });

  it("keeps the rule for a minute, then reads it again", async () => {
    const { origin, requests, answer } = await fakeCore();
    let now = 0;
    const access = coreAccess(origin, "example", { now: () => now });

    const first = await access();
    answer.body = { kind: "open" };
    now += 59_000;
    const cached = await access();
    now += 1_000;
    const reread = await access();

    expect([first, cached, reread]).toEqual([
      { kind: "owner" },
      { kind: "owner" },
      { kind: "open" },
    ]);
    expect(requests).toHaveLength(2);
  });

  it("asks core once for requests that arrive together", async () => {
    const { origin, requests } = await fakeCore();
    const access = coreAccess(origin, "example");

    await Promise.all([access(), access(), access()]);

    expect(requests).toHaveLength(1);
  });

  /** Which way a load failed, its message and its cause. */
  async function failed(access: () => Promise<unknown>) {
    const error = await access().then(
      () => undefined,
      (reason: unknown) => reason,
    );
    if (!(error instanceof AccessRuleError)) {
      throw new Error("The load didn't fail with an AccessRuleError.", {
        cause: error,
      });
    }
    return {
      failure: error.failure,
      message: error.message,
      cause: error.cause,
    };
  }

  it("names an app core doesn't know", async () => {
    const { origin, answer } = await fakeCore();
    answer.status = 404;
    answer.body = { error: "Not found" };

    expect(await failed(coreAccess(origin, "example"))).toEqual({
      failure: "unknown-app",
      message: "Core doesn't know an app called example.",
      cause: undefined,
    });
  });

  it("names an answer that isn't a rule, with what was wrong with it", async () => {
    const { origin, answer } = await fakeCore();
    answer.status = 500;
    answer.body = { error: "boom" };
    const status = await failed(coreAccess(origin, "example"));
    answer.status = 200;
    answer.body = { kind: "everyone" };
    const body = await failed(coreAccess(origin, "example"));

    expect([status, body]).toEqual([
      {
        failure: "bad-answer",
        message: "Core answered 500 for example's access rule.",
        cause: undefined,
      },
      {
        failure: "bad-answer",
        message: "Core sent an access rule for example that isn't one.",
        cause: {
          error: `{"kind":"everyone"} isn't an access rule. Use {"kind": "open"}, {"kind": "owner"}, or {"kind": "roles", "roles": [...]} listing role ids.`,
        },
      },
    ]);
  });

  it("names a body that isn't JSON, keeping the parser's error", async () => {
    const { origin, answer } = await fakeCore();
    answer.raw = "{not json";

    const { failure, message, cause } = await failed(
      coreAccess(origin, "example"),
    );

    expect({ failure, message }).toEqual({
      failure: "invalid-json",
      message: "Core's answer for example's access rule isn't JSON.",
    });
    expect(cause).toBeInstanceOf(SyntaxError);
  });

  it("names a body cut off part way, keeping the read's error", async () => {
    const { origin, answer } = await fakeCore();
    answer.cutOff = true;

    const { failure, message, cause } = await failed(
      coreAccess(origin, "example"),
    );

    expect({ failure, message }).toEqual({
      failure: "interrupted-body",
      message:
        "Core's answer for example's access rule broke off before its end.",
    });
    expect(cause).toBeInstanceOf(Error);
  });

  it("tries again after a failure instead of keeping it", async () => {
    const { origin, answer } = await fakeCore();
    const access = coreAccess(origin, "example");
    answer.status = 500;
    await expect(access()).rejects.toThrow();

    answer.status = 200;

    expect(await access()).toEqual({ kind: "owner" });
  });

  it("throws when core can't be reached", async () => {
    const { origin } = await fakeCore();
    const [server] = servers.splice(0);
    server?.close();
    if (server) await once(server, "close");

    await expect(coreAccess(origin, "example")()).rejects.toBeInstanceOf(
      CoreUnreachableError,
    );
  });
});
