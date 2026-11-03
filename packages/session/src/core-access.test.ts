import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { coreAccess } from "./core-access.ts";

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
  const answer: { status: number; body: unknown } = {
    status: 200,
    body: { kind: "owner" },
  };
  const server = createServer((req, res) => {
    requests.push(`${String(req.headers.host)} ${String(req.url)}`);
    res.writeHead(answer.status, { "content-type": "application/json" });
    res.end(JSON.stringify(answer.body));
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

  it.each([
    [404, { error: "Not found" }, "Core doesn't know an app called example."],
    [500, { error: "boom" }, "Core answered 500 for example's access rule."],
    [
      200,
      { kind: "everyone" },
      "Core sent an access rule for example that isn't one.",
    ],
  ])("throws when core answers %i with %j", async (status, body, message) => {
    const { origin, answer } = await fakeCore();
    answer.status = status;
    answer.body = body;

    await expect(coreAccess(origin, "example")()).rejects.toThrow(message);
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

    await expect(coreAccess(origin, "example")()).rejects.toThrow();
  });
});
