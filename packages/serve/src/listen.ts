import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

/**
 * What answers each request, as Node hands it over: an Express app, or a
 * fetch handler made into one, such as by `getRequestListener` from
 * `@hono/node-server`.
 */
export type RequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => void | Promise<void>;

export interface ListenOptions {
  hostname: string;
  port: number;
  /** The server's name in the lines it prints, such as `core`. */
  name: string;
  /** Runs once the server has stopped, before its line, such as closing the database. */
  onStopped: () => Promise<void>;
}

/** A server that has started, and its exit code once a signal stops it. */
interface Started {
  server: Server;
  /**
   * 0 once SIGTERM or SIGINT has stopped the server. It rejects when the
   * server can't listen, and never settles if something else closes it.
   */
  stopped: Promise<number>;
}

/**
 * Starts serving `app` on `hostname` and `port`, and stops it on SIGTERM
 * or SIGINT. Closing the server any other way, as a test does, takes its
 * signal listeners away with it.
 */
export function start(
  app: RequestHandler,
  { hostname, port, name, onStopped }: ListenOptions,
): Started {
  const { promise: stopped, resolve, reject } = Promise.withResolvers<number>();
  let stopping = false;
  // The answers whose request is still open.
  const open = new Set<ServerResponse>();
  // Node's close() ends only the connections idle at that moment. One that
  // is busy stays open as keep-alive, and Node goes on answering on it, so
  // a proxy with requests to send could hold the server open until Docker
  // kills it. So each answer sent while stopping says its connection ends
  // with it, and Node then closes it. An app's own `Connection` header
  // still wins, as Node merges the headers it writes over these.
  const server = createServer((request, response) => {
    if (stopping) response.setHeader("connection", "close");
    open.add(response);
    response.once("close", () => open.delete(response));
    // A handler that throws or rejects is a fault in the app. It gets a
    // 500 rather than ending the server and every request open on it.
    new Promise<void>((resolve) => {
      resolve(app(request, response));
    }).catch((error: unknown) => {
      console.error(
        `${name} couldn't answer ${String(request.method)} ${String(request.url)}.`,
        error,
      );
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  const stop = () => {
    // A second signal, such as Ctrl+C reaching a whole process group, is
    // the same request: the listener stays so it can't end the process.
    if (stopping) return;
    stopping = true;
    for (const response of open) {
      if (!response.headersSent) response.setHeader("connection", "close");
    }
    // Node takes no new connection and closes the idle ones at once.
    server.close(() => {
      onStopped().then(() => {
        console.log(`${name} stopped`);
        resolve(0);
      }, reject);
    });
  };
  const unlisten = () => {
    process.off("SIGTERM", stop);
    process.off("SIGINT", stop);
  };
  server.once("close", unlisten);
  // Such as the port being taken: it never listened, so nothing is open.
  server.once("error", (error) => {
    unlisten();
    onStopped().then(() => {
      reject(error);
    }, reject);
  });
  server.listen(port, hostname, () => {
    console.log(`${name} listening on ${hostname}:${String(port)}`);
  });
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  return { server, stopped };
}

/**
 * Serves `app` on `hostname` and `port` until SIGTERM or SIGINT. Then it
 * stops taking new connections, lets the requests already open finish,
 * closes each connection with its last answer, runs `onStopped`, prints
 * `<name> stopped` and resolves with 0, the exit code for a clean stop.
 * Docker sends SIGTERM to stop a container, and waits 10 seconds before it
 * kills it.
 *
 * @returns the exit code once it has stopped
 */
export function listenUntilStopped(
  app: RequestHandler,
  options: ListenOptions,
): Promise<number> {
  return start(app, options).stopped;
}
