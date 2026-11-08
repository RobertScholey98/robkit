import type { Server } from "node:net";

/**
 * `value`, which this package knows is there, such as a reader's answer to
 * a value it wrote itself. Anything else is a fault here, so it throws.
 */
export function known<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`${what} is missing.`);
  return value;
}

/** The TCP port `server` listens on. Throws if it listens on anything else. */
export function listeningPort(server: Server): number {
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error(`The server listens on ${String(address)}, not a port.`);
  }
  return address.port;
}
