import { once } from "node:events";
import {
  createServer,
  request,
  type IncomingHttpHeaders,
  type Server,
} from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createProxy, type Route } from "./proxy.ts";

interface Reply {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(async (server) => {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    }),
  );
});

async function listen(server: Server): Promise<number> {
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return (server.address() as AddressInfo).port;
}

async function unusedPort(): Promise<number> {
  const server = createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  server.close();
  await once(server, "close");
  return port;
}

/** An app that answers every request by describing it. */
function echoApp(): Server {
  return createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => (body += chunk));
    req.on("end", () => {
      res.setHeader("set-cookie", ["a=1", "b=2"]);
      res.writeHead(201, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          method: req.method,
          url: req.url,
          host: req.headers.host,
          custom: req.headers["x-custom"],
          body,
        }),
      );
    });
  });
}

function send(
  port: number,
  host: string,
  options: {
    method?: string;
    path?: string;
    body?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        method: options.method ?? "GET",
        path: options.path ?? "/",
        headers: { host, ...options.headers },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (body += chunk));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
        });
      },
    );
    req.on("error", reject);
    req.end(options.body);
  });
}

async function startProxy(routes: Route[]): Promise<number> {
  return listen(createProxy(routes));
}

describe("createProxy", () => {
  it("forwards a request to the app that owns its host", async () => {
    const hub = await listen(echoApp());
    const core = await listen(echoApp());
    const proxy = await startProxy([
      { host: "hub.localhost", app: "hub", port: hub },
      { host: "core.localhost", app: "core", port: core },
    ]);

    const reply = await send(proxy, "core.localhost:3000", {
      method: "POST",
      path: "/status?x=1",
      body: "hello",
      headers: { "x-custom": "yes" },
    });

    expect(reply.status).toBe(201);
    expect(reply.headers["set-cookie"]).toEqual(["a=1", "b=2"]);
    expect(JSON.parse(reply.body)).toEqual({
      method: "POST",
      url: "/status?x=1",
      host: "core.localhost:3000",
      custom: "yes",
      body: "hello",
    });
  });

  it("answers an unknown host with 404 naming the hosts it serves", async () => {
    const proxy = await startProxy([
      { host: "hub.localhost", app: "hub", port: 1 },
      { host: "core.localhost", app: "core", port: 2 },
    ]);

    const reply = await send(proxy, "nope.localhost:3000");

    expect(reply.status).toBe(404);
    expect(reply.body).toContain("nope.localhost");
    expect(reply.body).toContain("hub.localhost");
    expect(reply.body).toContain("core.localhost");
  });

  it("answers 502 naming the app when the app refuses the connection", async () => {
    const proxy = await startProxy([
      { host: "hub.localhost", app: "hub", port: await unusedPort() },
    ]);

    const reply = await send(proxy, "hub.localhost");

    expect(reply.status).toBe(502);
    expect(reply.body).toContain("hub");
  });

  it("forwards an upgrade request and then the raw connection", async () => {
    const app = createServer();
    app.on("upgrade", (req, socket) => {
      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
          "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
          `X-Seen-Host: ${String(req.headers.host)}\r\n\r\n`,
      );
      socket.on("data", (data) => socket.write(data));
      socket.on("end", () => socket.end());
    });
    const proxy = await startProxy([
      { host: "hub.localhost", app: "hub", port: await listen(app) },
    ]);

    const req = request({
      host: "127.0.0.1",
      port: proxy,
      headers: {
        host: "hub.localhost:3000",
        connection: "Upgrade",
        upgrade: "websocket",
      },
    });
    req.end();
    const [res, socket] = (await once(req, "upgrade")) as [
      { headers: IncomingHttpHeaders },
      Socket,
    ];
    socket.write("ping");
    const [echoed] = (await once(socket, "data")) as [Buffer];
    socket.destroy();

    expect(res.headers["x-seen-host"]).toBe("hub.localhost:3000");
    expect(echoed.toString()).toBe("ping");
  });

  it("answers an upgrade with 502 when the app refuses the connection", async () => {
    const proxy = await startProxy([
      { host: "hub.localhost", app: "hub", port: await unusedPort() },
    ]);

    const req = request({
      host: "127.0.0.1",
      port: proxy,
      headers: {
        host: "hub.localhost",
        connection: "Upgrade",
        upgrade: "websocket",
      },
    });
    req.end();
    const [res] = (await once(req, "response")) as [{ statusCode: number }];

    expect(res.statusCode).toBe(502);
  });
});
