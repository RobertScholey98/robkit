import { once } from "node:events";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { describe, expect, it, onTestFinished } from "vitest";
import { known, listeningPort } from "./known.ts";

async function listening(listen: (server: Server) => void) {
  const server = createServer();
  listen(server);
  await once(server, "listening");
  onTestFinished(() => {
    server.close();
  });
  return server;
}

describe("known", () => {
  it("passes a value through", () => {
    expect(known(0, "The count")).toBe(0);
  });

  it("throws when the value is missing", () => {
    expect(() => known<number>(undefined, "The count")).toThrow(
      "The count is missing.",
    );
  });
});

describe("listeningPort", () => {
  it("reads the port a TCP server listens on", async () => {
    const server = await listening((s) => s.listen(0, "127.0.0.1"));
    const port = listeningPort(server);
    expect(port).toBeGreaterThan(0);
  });

  it("throws for a server on a pipe or socket file", async () => {
    const name = `robkit-test-${randomBytes(4).toString("hex")}`;
    const path =
      process.platform === "win32"
        ? `\\\\.\\pipe\\${name}`
        : join(tmpdir(), `${name}.sock`);
    const server = await listening((s) => s.listen(path));
    expect(() => listeningPort(server)).toThrow(
      `The server listens on ${path}, not a port.`,
    );
  });

  it("throws for a server that isn't listening", () => {
    expect(() => listeningPort(createServer())).toThrow(
      "The server listens on null, not a port.",
    );
  });
});
