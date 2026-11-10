import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  createServer,
  request,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
} from "node:http";
import { connect, type AddressInfo, type Socket } from "node:net";
import { networkInterfaces } from "node:os";
import { afterEach, describe, expect, it, onTestFinished } from "vitest";
import { loopback, startProxy, type Proxy, type Route } from "./proxy.ts";

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
          forwardedFor: req.headers["x-forwarded-for"],
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

const proxies: Proxy[] = [];

afterEach(() => {
  for (const proxy of proxies.splice(0)) proxy.close();
});

/** A proxy for `routes` on `hosts`, closed after the test. */
async function start(
  routes: Route[],
  hosts: readonly string[] = ["127.0.0.1"],
): Promise<Proxy> {
  const proxy = await startProxy(routes, 0, hosts);
  proxies.push(proxy);
  return proxy;
}

/** The port of a proxy for `routes` on 127.0.0.1. */
async function proxyPort(routes: Route[]): Promise<number> {
  return (await start(routes)).port;
}

/** Whether this machine lets a server listen on `host`. */
async function canListenOn(host: string): Promise<boolean> {
  const server = createServer();
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, host, resolve);
    });
  } catch {
    // The machine lacks the address.
    return false;
  }
  server.close();
  return true;
}

/** Whether a connection to `host` and `port` is taken. */
function connects(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, host);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      resolve(false);
    });
  });
}

/** An address of this machine that isn't loopback, if it has one. */
function outsideAddress(): string | undefined {
  return Object.values(networkInterfaces())
    .flat()
    .find(
      (address) => address && !address.internal && address.family === "IPv4",
    )?.address;
}

describe("startProxy's addresses", () => {
  it("listens on 127.0.0.1, on ::1 where the machine has it, and nowhere else", async () => {
    const hasIpv6Loopback = await canListenOn("::1");

    const proxy = await start([], loopback);

    expect(proxy.hosts).toEqual(
      hasIpv6Loopback ? ["127.0.0.1", "::1"] : ["127.0.0.1"],
    );
    expect(await connects("127.0.0.1", proxy.port)).toBe(true);
    if (hasIpv6Loopback) expect(await connects("::1", proxy.port)).toBe(true);
    const outside = outsideAddress();
    if (outside) expect(await connects(outside, proxy.port)).toBe(false);
  });

  it("starts without an address the machine lacks, as one with IPv6 off lacks ::1", async () => {
    // 2001:db8::/32 is for documentation, so no machine has it, and the
    // listen fails as it does for ::1 on a machine without it.
    const proxy = await start([], ["127.0.0.1", "2001:db8::1"]);

    expect(proxy.hosts).toEqual(["127.0.0.1"]);
    expect(await connects("127.0.0.1", proxy.port)).toBe(true);
  });

  it("refuses a port that's taken, leaving nothing listening", async () => {
    const taken = await listen(createServer());

    await expect(
      startProxy([], taken, ["127.0.0.1", "::1"]),
    ).rejects.toMatchObject({ code: "EADDRINUSE" });
  });
});

describe("startProxy", () => {
  it("forwards a request to the app that owns its host", async () => {
    const hub = await listen(echoApp());
    const core = await listen(echoApp());
    const proxy = await proxyPort([
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
      forwardedFor: "127.0.0.1",
      body: "hello",
    });
  });

  it("appends the client's address to X-Forwarded-For, as Traefik does", async () => {
    const core = await listen(echoApp());
    const proxy = await proxyPort([
      { host: "core.localhost", app: "core", port: core },
    ]);

    const fresh = await send(proxy, "core.localhost");
    const chained = await send(proxy, "core.localhost", {
      headers: { "x-forwarded-for": "203.0.113.7" },
    });

    expect(JSON.parse(fresh.body)).toMatchObject({ forwardedFor: "127.0.0.1" });
    expect(JSON.parse(chained.body)).toMatchObject({
      forwardedFor: "203.0.113.7, 127.0.0.1",
    });
  });

  it("answers an unknown host with 404 naming the hosts it serves", async () => {
    const proxy = await proxyPort([
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
    const proxy = await proxyPort([
      { host: "hub.localhost", app: "hub", port: await unusedPort() },
    ]);

    const reply = await send(proxy, "hub.localhost");

    expect(reply.status).toBe(502);
    expect(reply.body).toContain("hub");
  });

  it("ends the request within a second when the app is killed mid-answer", async () => {
    // An app in its own process, which answers with headers and a first
    // chunk and then never finishes.
    const app = spawn(
      process.execPath,
      [
        "-e",
        `require("node:http").createServer((req, res) => {
          res.writeHead(200);
          res.write("first chunk");
        }).listen(0, "127.0.0.1", function () {
          console.log(this.address().port);
        });`,
      ],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    onTestFinished(() => {
      app.kill("SIGKILL");
    });
    const [line] = (await once(app.stdout, "data")) as [Buffer];
    const proxy = await proxyPort([
      { host: "hub.localhost", app: "hub", port: Number(String(line).trim()) },
    ]);
    const req = request({
      host: "127.0.0.1",
      port: proxy,
      headers: { host: "hub.localhost" },
    });
    req.on("error", () => {
      // A request cut off mid-answer may also fail here; the test reads
      // the answer's close below.
    });
    req.end();
    const [res] = (await once(req, "response")) as [IncomingMessage];
    // once() would reject on the cut-off answer's error, before its close.
    const closed = new Promise((resolve) => res.on("close", resolve));
    res.on("error", () => {
      // The cut-off answer errors as aborted, which is the point.
    });
    await once(res, "data");

    app.kill("SIGKILL");
    const killed = Date.now();
    await closed;

    expect(Date.now() - killed).toBeLessThan(1000);
    expect(res.complete).toBe(false);
  });

  it("forwards an upgrade request and then the raw connection", async () => {
    const app = createServer();
    app.on("upgrade", (req, socket) => {
      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
          "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
          `X-Seen-Host: ${String(req.headers.host)}\r\n` +
          `X-Seen-Forwarded-For: ${String(req.headers["x-forwarded-for"])}\r\n\r\n`,
      );
      socket.on("data", (data) => socket.write(data));
      socket.on("end", () => socket.end());
    });
    const proxy = await proxyPort([
      { host: "hub.localhost", app: "hub", port: await listen(app) },
    ]);

    const req = request({
      host: "127.0.0.1",
      port: proxy,
      headers: {
        host: "hub.localhost:3000",
        connection: "Upgrade",
        upgrade: "websocket",
        "x-forwarded-for": "203.0.113.7",
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
    expect(res.headers["x-seen-forwarded-for"]).toBe("203.0.113.7, 127.0.0.1");
    expect(echoed.toString()).toBe("ping");
  });

  it("answers an upgrade with 502 when the app refuses the connection", async () => {
    const proxy = await proxyPort([
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
