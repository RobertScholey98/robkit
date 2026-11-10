import { once } from "node:events";
import { join } from "node:path";
import {
  answerAt,
  builtApp,
  printedOnExit,
  serving,
} from "@internal/test-session";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { serve } from "./serve.ts";

/** A Start build: the client's files, and the server entry beside them. */
const startBuild = {
  "dist/client/assets/page.css": "body {}",
  "dist/client/robots.txt": "User-agent: *",
  "dist/server/server.js": `export default {
  fetch: (request) =>
    new Response("app: " + new URL(request.url).pathname, {
      status: 404,
      headers: { "content-type": "text/plain" },
    }),
};
`,
};

describe("@robkit/start/serve", () => {
  it("answers the client's files, then Start's server entry, from the app's own folder", async () => {
    const folder = await builtApp(startBuild);
    const { port } = await serving(folder, () => serve());

    expect([
      await answerAt(port, "/assets/page.css"),
      await answerAt(port, "/robots.txt"),
      await answerAt(port, "/notes"),
    ]).toEqual([
      {
        status: 200,
        type: "text/css; charset=utf-8",
        sniff: "nosniff",
        body: "body {}",
      },
      {
        status: 200,
        type: "text/plain; charset=utf-8",
        sniff: "nosniff",
        body: "User-agent: *",
      },
      {
        status: 404,
        type: "text/plain",
        sniff: "nosniff",
        body: "app: /notes",
      },
    ]);
  });

  it.each([
    "/server/server.js",
    "/dist/server/server.js",
    "/../server/server.js",
    "/%2e%2e/server/server.js",
    "/assets/..%2f..%2fserver/server.js",
  ])("never answers %s with the server's own file", async (path) => {
    const folder = await builtApp(startBuild);
    const { port } = await serving(folder, () => serve());

    const { status, body } = await answerAt(port, path);

    expect({ status, body: body.startsWith("app: ") }).toEqual({
      status: 404,
      body: true,
    });
  });

  it("gives back the Node server once it listens on HOST and PORT, which a test can close", async () => {
    const folder = await builtApp(startBuild);
    const { server, port } = await serving(folder, () => serve());

    expect(server.address()).toMatchObject({ address: "127.0.0.1", port });
    server.close();
    await once(server, "close");
    expect(server.listening).toBe(false);
  });

  it("refuses a malformed PORT with the reader's message, before it loads the build", async () => {
    const folder = await builtApp(startBuild);
    const server = join(folder, "dist/server/server.js");
    vi.stubEnv("PORT", "web");
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });

    expect(
      printedOnExit(() =>
        serve({ server, client: join(folder, "dist/client") }),
      ),
    ).toBe(
      `PORT is "web", which isn't a port. Set it to a whole number from 1 to 65535, or leave it unset for 3000.`,
    );
  });

  it("refuses to start without the build, saying to run it", async () => {
    const folder = await builtApp({});

    expect(
      printedOnExit(() =>
        serve({ server: join(folder, "dist/server/server.js") }),
      ),
    ).toBe(
      `${join(folder, "dist/server/server.js")} isn't there. Run the app's build, pnpm build, before it serves.`,
    );
  });

  it("throws when the build's server entry exports none", async () => {
    const folder = await builtApp({ "dist/server/server.js": "export {};\n" });

    await expect(
      serve({ server: join(folder, "dist/server/server.js") }),
    ).rejects.toThrow(
      `${join(folder, "dist/server/server.js")} exports no server entry as its default.`,
    );
  });
});
