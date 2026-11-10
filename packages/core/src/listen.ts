import { serve } from "@hono/node-server";

export interface ListenOptions {
  /** What answers each request, such as a Hono app's `fetch`. */
  fetch: (request: Request) => Response | Promise<Response>;
  hostname: string;
  port: number;
  /** The server's name in the lines it prints, such as `core`. */
  name: string;
  /** Runs once the server has stopped, before its line, such as closing the database. */
  onStopped: () => Promise<void>;
}

/**
 * Serves `fetch` on `hostname` and `port` until SIGTERM or SIGINT. Then it
 * stops taking new connections, lets the requests already open finish,
 * closes each connection with its last answer, runs `onStopped`, prints
 * `<name> stopped` and resolves with 0, the exit code for a clean stop.
 * Docker sends SIGTERM to stop a container, and waits 10 seconds before it
 * kills it.
 *
 * Ticket 11 moves this to `@robkit/serve`, which every server will share.
 *
 * @returns the exit code once it has stopped
 */
export async function listenUntilStopped({
  // Not the global fetch: the app's handler, under a name that says so.
  fetch: handle,
  hostname,
  port,
  name,
  onStopped,
}: ListenOptions): Promise<number> {
  const { promise: stopped, resolve, reject } = Promise.withResolvers<number>();
  const cleanUp = () => {
    process.off("SIGTERM", stop);
    process.off("SIGINT", stop);
    return onStopped();
  };
  let stopping = false;
  // Node's close() ends only the connections idle at that moment. One that
  // is busy stays open as keep-alive, and Node goes on answering on it, so
  // a proxy with requests to send could hold the server open until Docker
  // kills it. So each answer sent while stopping says its connection ends
  // with it, and Node then closes it.
  const answer = async (request: Request): Promise<Response> => {
    const response = await handle(request);
    if (!stopping) return response;
    const headers = new Headers(response.headers);
    headers.set("connection", "close");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
  const server = serve({ fetch: answer, hostname, port }, ({ port }) => {
    console.log(`${name} listening on ${hostname}:${String(port)}`);
  });
  // Such as the port being taken: it never listened, so nothing is open.
  server.once("error", (error) => {
    cleanUp().then(() => {
      reject(error);
    }, reject);
  });

  const stop = () => {
    // A second signal, such as Ctrl+C reaching a whole process group, is
    // the same request: the listener stays so it can't end the process.
    if (stopping) return;
    stopping = true;
    // Node takes no new connection and closes the idle ones at once. Each
    // busy one closes with its answer, which `answer` marks.
    server.close(() => {
      cleanUp().then(() => {
        console.log(`${name} stopped`);
        resolve(0);
      }, reject);
    });
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  return stopped;
}
