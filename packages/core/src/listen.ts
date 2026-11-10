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
 * runs `onStopped`, prints `<name> stopped` and resolves with 0, the exit
 * code for a clean stop. Docker sends SIGTERM to stop a container, and
 * waits 10 seconds before it kills it.
 *
 * Ticket 11 moves this to `@robkit/serve`, which every server will share.
 *
 * @returns the exit code once it has stopped
 */
export async function listenUntilStopped({
  fetch,
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
  const server = serve({ fetch, hostname, port }, ({ port }) => {
    console.log(`${name} listening on ${hostname}:${String(port)}`);
  });
  // Such as the port being taken: it never listened, so nothing is open.
  server.once("error", (error) => {
    cleanUp().then(() => {
      reject(error);
    }, reject);
  });

  let stopping = false;
  const stop = () => {
    // A second signal, such as Ctrl+C reaching a whole process group, is
    // the same request: the listener stays so it can't end the process.
    if (stopping) return;
    stopping = true;
    // Node closes idle keep-alive connections at once, and each busy one
    // once its response is sent.
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
