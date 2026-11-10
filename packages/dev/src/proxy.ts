import {
  createServer,
  request,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { connect } from "node:net";
import { pipeline, type Duplex } from "node:stream";

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

/** What answers each request and upgrade the proxy takes. */
interface Handlers {
  onRequest: (req: IncomingMessage, res: ServerResponse) => void;
  onUpgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
  /** Routes one more host, from the next request on. */
  route: (route: Route) => void;
}

/**
 * Routes each request by its Host header to the app that owns that host, so
 * local URLs look like production subdomains.
 */
function proxyHandlers(first: readonly Route[]): Handlers {
  const routes = [...first];
  const byHost = new Map(routes.map((route) => [route.host, route]));
  const routeFor = (host: string | undefined) => {
    const hostname = hostnameOf(host);
    return hostname === undefined ? undefined : byHost.get(hostname);
  };

  const onRequest = (req: IncomingMessage, res: ServerResponse) => {
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
        // An app that dies or restarts mid-answer cuts its answer off. The
        // pipeline then ends the browser's request too, rather than leave
        // it waiting for the rest.
        pipeline(reply, res, () => {
          // A cut-off answer is the app's to explain, and the browser sees
          // its request end.
        });
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
  };

  // WebSockets (Vite's HMR among them) arrive as upgrades. Replay the request
  // line and headers to the app, then splice the two sockets together.
  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
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
  };

  const route = (added: Route) => {
    routes.push(added);
    byHost.set(added.host, added);
  };

  return { onRequest, onUpgrade, route };
}

/**
 * Where the proxy listens: loopback alone, since `pnpm dev` serves a local
 * domain only this machine resolves. A browser may try either address for a
 * name under `.localhost`, so both, where the machine has IPv6's.
 */
export const loopback: readonly string[] = ["127.0.0.1", "::1"];

/** The dev proxy, listening. */
export interface Proxy {
  /** The addresses it listens on, in the order asked. */
  hosts: string[];
  /** Its port: the one asked for, or the one the first address got for 0. */
  port: number;
  /** Routes one more host on every address, from the next request on. */
  route: (route: Route) => void;
  /** Stops listening and ends every open request. */
  close: () => void;
}

/** Whether a listen failed because the machine lacks the address, as one with IPv6 off lacks `::1`. */
function isAbsent(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT")
  );
}

/** Listens on `host` and `port`, rejecting with the listen's error. */
function listen(server: Server, port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : port);
    });
  });
}

/**
 * Starts the dev proxy for `routes` on `port`, at each of `hosts` the
 * machine has. A port of 0 takes the one the OS gives the first host, and
 * the rest listen on it too. One server per host, all with the same routes.
 *
 * @throws the listen's error, such as EADDRINUSE, with nothing left
 *   listening; or when the machine has none of `hosts`
 */
export async function startProxy(
  routes: readonly Route[],
  port: number,
  hosts: readonly string[] = loopback,
): Promise<Proxy> {
  const { onRequest, onUpgrade, route } = proxyHandlers(routes);
  const listening: { host: string; server: Server }[] = [];
  const close = () => {
    for (const { server } of listening) {
      server.closeAllConnections();
      server.close();
    }
  };
  let bound = port;
  for (const host of hosts) {
    const server = createServer(onRequest).on("upgrade", onUpgrade);
    try {
      bound = await listen(server, bound, host);
    } catch (error) {
      if (isAbsent(error)) continue;
      close();
      throw error;
    }
    listening.push({ host, server });
  }
  if (listening.length === 0) {
    throw new Error(
      `The dev proxy found none of ${hosts.join(", ")} on this machine to listen on.`,
    );
  }
  return {
    hosts: listening.map(({ host }) => host),
    port: bound,
    route,
    close,
  };
}
