import { once } from "node:events";
import { createServer, type ServerResponse } from "node:http";
import { onTestFinished, describe, expect, it } from "vitest";
import { loopbackFetch } from "./loopback-fetch.ts";

/** A `*.localhost` URL served from a loopback port by `answer`. */
async function served(answer: (res: ServerResponse) => void) {
  const server = createServer((_req, res) => {
    answer(res);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  onTestFinished(async () => {
    server.closeAllConnections();
    server.close();
    await once(server, "close");
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return `http://core.robkit.localhost:${String(port)}/apps/example/access`;
}

const get = (url: string) =>
  loopbackFetch(url, {
    method: "GET",
    headers: new Headers({ accept: "application/json" }),
    redirect: "manual",
    signal: AbortSignal.timeout(5000),
  });

describe("loopbackFetch", () => {
  it("reads a whole answer", async () => {
    const url = await served((res) => {
      res.writeHead(201, { "content-type": "application/json" });
      res.end('{"kind":"owner"}');
    });

    const res = await get(url);

    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.text()).toBe('{"kind":"owner"}');
  });

  it("leaves a name outside localhost to fetch", async () => {
    const url = await served((res) => {
      res.writeHead(201, { "content-type": "application/json" });
      res.end('{"kind":"open"}');
    });
    const direct = new URL(url);
    direct.hostname = "127.0.0.1";

    const res = await get(direct.href);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ kind: "open" });
  });

  it("answers once the headers arrive, as fetch does, so a body cut off fails its read", async () => {
    const url = await served((res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.write('{"kind":', () => res.destroy());
    });

    const res = await get(url);

    expect(res.status).toBe(200);
    await expect(res.text()).rejects.toThrow();
  });

  it("lets go of the connection when the body is cancelled", async () => {
    let closed: Promise<unknown> = Promise.resolve();
    const url = await served((res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.write("{");
      closed = once(res, "close");
    });

    const res = await get(url);
    await res.body?.cancel();

    await expect(closed).resolves.toBeDefined();
  });
});
