import { connect } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

/** How often the runner tries an app's port while it starts. */
const probeEveryMs = 100;

/** Whether something on 127.0.0.1 takes a connection on `port`. */
function takesConnection(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Waits until an app's port on 127.0.0.1 takes a connection, which works
 * for every stack, where reading the line each prints as it starts
 * doesn't. The proxy reaches the app there, so from then on a request
 * gets the app's answer.
 *
 * @returns true once the port answers, or false if `signal` aborts first
 */
export async function untilAnswering(
  port: number,
  signal: AbortSignal,
): Promise<boolean> {
  while (!signal.aborted) {
    if (await takesConnection(port)) return true;
    try {
      await sleep(probeEveryMs, undefined, { signal });
    } catch {
      // Aborted: the runner is stopping, and the loop ends.
    }
  }
  return false;
}
