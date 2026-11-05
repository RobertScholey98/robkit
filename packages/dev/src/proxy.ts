import {
  createServer,
  request,
  type IncomingMessage,
  type Server,
} from "node:http";
import { connect } from "node:net";
import type { Duplex } from "node:stream";

/** Sends requests for one host to the app listening on a local port. */
export interface Route {
  host: string;
  app: string;
  port: number;
}

const plainText = { "content-type": "text/plain; charset=utf-8" };

/** The Host header's hostname, without any port. */
function hostnameOf(host: string | undefined): string | undefined {
  if (!host) return undefined;
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    // A Host that isn't a hostname matches no app, so the proxy answers 404.
    return undefined;
  }
}

/**
 * The X-Forwarded-For value to send upstream: whatever the client sent, then
 * the client's own address, as Traefik does in production.
 */
function forwardedFor(req: IncomingMessage): string {
  const client = req.socket.remoteAddress ?? "unknown";
  const earlier = req.headers["x-forwarded-for"] ?? [];
  return [earlier, client].flat().join(", ");
}

/**
 * The dev proxy: routes each request by its Host header to the app that owns
 * that host, so local URLs look like production subdomains.
 */
export function createProxy(routes: readonly Route[]): Server {
  const byHost = new Map(routes.map((route) => [route.host, route]));
  const routeFor = (host: string | undefined) => {
    const hostname = hostnameOf(host);
    return hostname === undefined ? undefined : byHost.get(hostname);
  };

  const server = createServer((req, res) => {
    const route = routeFor(req.headers.host);
    if (!route) {
      res.writeHead(404, plainText);
      res.end(
        `No app answers ${String(req.headers.host)}. This proxy serves:\n` +
          routes.map((r) => `  ${r.host}\n`).join(""),
      );
      return;
    }

    const upstream = request(
      {
        host: "127.0.0.1",
        port: route.port,
        method: req.method,
        path: req.url,
        headers: { ...req.headers, "x-forwarded-for": forwardedFor(req) },
      },
      (reply) => {
        res.writeHead(reply.statusCode ?? 502, reply.rawHeaders);
        reply.pipe(res);
      },
    );
    upstream.on("error", (error) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.writeHead(502, plainText);
      res.end(
        `${route.app} is not answering on port ${String(route.port)}: ${error.message}\n`,
      );
    });
    res.on("close", () => upstream.destroy());
    req.pipe(upstream);
  });

  // WebSockets (Vite's HMR among them) arrive as upgrades. Replay the request
  // line and headers to the app, then splice the two sockets together.
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const route = routeFor(req.headers.host);
    if (!route) {
      socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      return;
    }

    let connected = false;
    const upstream = connect(route.port, "127.0.0.1", () => {
      connected = true;
      const headers = [];
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const name = String(req.rawHeaders[i]);
        if (name.toLowerCase() === "x-forwarded-for") continue;
        headers.push(`${name}: ${String(req.rawHeaders[i + 1])}\r\n`);
      }
      headers.push(`X-Forwarded-For: ${forwardedFor(req)}\r\n`);
      upstream.write(
        `${String(req.method)} ${String(req.url)} HTTP/${req.httpVersion}\r\n${headers.join("")}\r\n`,
      );
      upstream.write(head);
      upstream.pipe(socket).pipe(upstream);
    });
    upstream.on("error", () => {
      // Once connected, the socket carries the app's own bytes, so a 502
      // could only corrupt them.
      if (connected) socket.destroy();
      else socket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
    });
    socket.on("error", () => upstream.destroy());
    socket.on("close", () => upstream.destroy());
    upstream.on("close", () => socket.destroy());
  });

  return server;
}
