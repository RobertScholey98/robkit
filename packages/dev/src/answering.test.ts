import { once } from "node:events";
import { createServer, type AddressInfo } from "node:net";
import { describe, expect, it, onTestFinished } from "vitest";
import { untilAnswering } from "./answering.ts";

/** A port nothing listens on yet, and a way to start listening on it. */
async function quietPort() {
  const probe = createServer().listen(0, "127.0.0.1");
  await once(probe, "listening");
  const { port } = probe.address() as AddressInfo;
  probe.close();
  await once(probe, "close");
  return {
    port,
    listen: async () => {
      const server = createServer().listen(port, "127.0.0.1");
      onTestFinished(() => {
        server.close();
      });
      await once(server, "listening");
    },
  };
}

describe("untilAnswering", () => {
  it("waits until the port takes a connection", async () => {
    const { port, listen } = await quietPort();

    const answering = untilAnswering(port, new AbortController().signal);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await listen();

    expect(await answering).toBe(true);
  });

  it("gives up once the runner stops", async () => {
    const { port } = await quietPort();
    const stop = new AbortController();

    const answering = untilAnswering(port, stop.signal);
    stop.abort();

    expect(await answering).toBe(false);
  });
});
