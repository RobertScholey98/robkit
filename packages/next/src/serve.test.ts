import { once } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  answerAt,
  builtApp,
  printedOnExit,
  serving,
} from "@internal/test-session";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { serve } from "./serve.ts";

/** What serve() asked Next for, and how many times Next got ready. */
const asked = vi.hoisted(() => ({
  options: [] as unknown[],
  prepared: 0,
}));

// Next itself needs a real build. This stands in for it: every page
// answers 404 with its path, as Next's own handler would for a missing one.
vi.mock("next", () => ({
  default: (options: unknown) => {
    asked.options.push(options);
    return {
      prepare: () => {
        asked.prepared += 1;
        return Promise.resolve();
      },
      getRequestHandler:
        () => (request: IncomingMessage, response: ServerResponse) => {
          response.statusCode = 404;
          response.setHeader("content-type", "text/plain");
          response.end(`next: ${String(request.url)}`);
          return Promise.resolve();
        },
    };
  },
}));

beforeEach(() => {
  asked.options = [];
  asked.prepared = 0;
});

describe("@robkit/next/serve", () => {
  it("hands every request to Next, ready and in production, with nothing answered before it", async () => {
    const folder = await builtApp({
      "dist/BUILD_ID": "build",
      "public/robots.txt": "User-agent: *",
    });
    const { port } = await serving(folder, () => serve());

    expect({
      answers: [
        await answerAt(port, "/notes"),
        (await answerAt(port, "/robots.txt")).body,
        (await answerAt(port, "/BUILD_ID")).body,
      ],
      asked: asked.options,
      prepared: asked.prepared,
    }).toEqual({
      answers: [
        {
          status: 404,
          type: "text/plain",
          sniff: "nosniff",
          body: "next: /notes",
        },
        "next: /robots.txt",
        "next: /BUILD_ID",
      ],
      asked: [{ dev: false, hostname: "127.0.0.1", port }],
      prepared: 1,
    });
  });

  it("gives back the Node server once it listens on HOST and PORT, which a test can close", async () => {
    const folder = await builtApp({});
    const { server, port } = await serving(folder, () => serve());

    expect(server.address()).toMatchObject({ address: "127.0.0.1", port });
    server.close();
    await once(server, "close");
    expect(server.listening).toBe(false);
  });

  it("refuses a malformed PORT with the reader's message, before Next loads", () => {
    vi.stubEnv("PORT", "web");
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });

    expect({
      printed: printedOnExit(() => serve()),
      asked: asked.options,
    }).toEqual({
      printed: `PORT is "web", which isn't a port. Set it to a whole number from 1 to 65535, or leave it unset for 3000.`,
      asked: [],
    });
  });
});
