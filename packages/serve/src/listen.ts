import type { Socket } from "node:net";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

/**
 * What answers each request, as Node hands it over: an Express app, or a
 * fetch handler made into one, such as by `getRequestListener` from
 * `@hono/node-server`. A promise it returns that rejects gets a 500.
 */
export type RequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => unknown;

export interface ListenOptions {
  hostname: string;
  port: number;
  /** The server's name in the lines it prints, such as `core`. */
  name: string;
  /** Runs once the server has stopped, before its line, such as closing the database. */
  onStopped: () => Promise<void>;
}

/**
 * How long the stop waits for open connections before it closes them, in
 * milliseconds. Docker kills a container 10 seconds after its signal, so
 * this leaves time for `onStopped` and the exit.
 */
const stopLimit = 8000;

/** "1 connection" or "2 connections". */
function connections(count: number): string {
  return `${String(count)} connection${count === 1 ? "" : "s"}`;
}

/** A server that has started, and its exit code once a signal stops it. */
interface Started {
  server: Server;
  /**
   * 0 once SIGTERM or SIGINT has stopped the server, or 1 if `onStopped`
   * then failed. It rejects when the server can't listen, and never
   * settles if something else closes it.
   */
  stopped: Promise<number>;
}

/**
 * Starts serving `app` on `hostname` and `port`, and stops it on SIGTERM
 * or SIGINT. Closing the server any other way, as a test does, takes its
 * signal listeners away with it. `limit` is the stop's, for tests.
 */
export function start(
  app: RequestHandler,
  { hostname, port, name, onStopped }: ListenOptions,
  limit = stopLimit,
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
    new Promise((resolve) => {
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
  // Every connection, upgraded ones such as a WebSocket's included, which
  // Node's closeAllConnections() leaves open.
  const sockets = new Set<Socket>();
  server.on("connection", (socket: Socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  const stop = () => {
    // A second signal, such as Ctrl+C reaching a whole process group, is
    // the same request: the listener stays so it can't end the process.
    if (stopping) return;
    stopping = true;
    for (const response of open) {
      if (!response.headersSent) response.setHeader("connection", "close");
    }
    // Some connections close only when the client lets go: one that has
    // sent nothing yet, one whose answer began before the signal, or an
    // upgraded one. Past the limit the stop closes them.
    const timer = setTimeout(() => {
      console.log(
        `${name} closed ${connections(sockets.size)} still open after ${String(limit / 1000)} seconds`,
      );
      for (const socket of sockets) socket.destroy();
    }, limit);
    // Node takes no new connection and closes the idle ones at once.
    server.close(() => {
      clearTimeout(timer);
      onStopped()
        .finally(unlisten)
        .then(
          () => {
            console.log(`${name} stopped`);
            resolve(0);
          },
          (error: unknown) => {
            // The server listened and has stopped, so this is no failure
            // to listen, which is what a rejection means to the caller.
            console.error(`${name} stopped, but its clean-up failed.`, error);
            resolve(1);
          },
        );
    });
  };
  const unlisten = () => {
    process.off("SIGTERM", stop);
    process.off("SIGINT", stop);
  };
  // A stop keeps its listeners until onStopped has finished, so a signal
  // that arrives meanwhile can't end the process halfway.
  server.once("close", () => {
    if (!stopping) unlisten();
  });
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
 * Connections still open 8 seconds after the signal are closed, and a line
 * before `<name> stopped` says how many. If `onStopped` rejects it prints
 * `<name> stopped, but its clean-up failed.` with the error, and resolves
 * with 1.
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
