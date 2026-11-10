import { once } from "node:events";
import { createServer } from "node:net";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { serve } from "./serve.ts";

// A file it can't read, such as one whose disk failed: serve-static hands
// the request on with a 500 error.
const failure = Object.assign(new Error("EIO: i/o error, read"), {
  statusCode: 500,
});
vi.mock("serve-static", () => ({
  default:
    () =>
    (_request: unknown, _response: unknown, next: (error: unknown) => void) => {
      next(failure);
    },
}));

/** A port nothing listens on. */
async function freePort(): Promise<number> {
  const server = createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  server.close();
  if (address === null || typeof address === "string") {
    throw new Error("The probe server has no port.");
  }
  return address.port;
}

describe("serve, when a file can't be read", () => {
  it("answers 500 and logs the cause, without handing the request to the app", async () => {
    const port = await freePort();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    onTestFinished(() => {
      log.mockRestore();
      errors.mockRestore();
    });
    const app = vi.fn();
    const server = serve(app, {
      address: { host: "127.0.0.1", port },
      files: [{ at: "/assets", folder: "dist/assets" }],
    });
    onTestFinished(async () => {
      server.close();
      await once(server, "close");
    });
    await once(server, "listening");

    const answer = await fetch(
      `http://127.0.0.1:${String(port)}/assets/page.css`,
    );

    expect(answer.status).toBe(500);
    expect(app).not.toHaveBeenCalled();
    expect(errors.mock.calls).toEqual([
      [
        "server couldn't answer GET /assets/page.css.",
        new Error("serve-static couldn't send a file.", { cause: failure }),
      ],
    ]);
  });
});
