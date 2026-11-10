import { once } from "node:events";
import {
  answerAt,
  builtApp,
  printedOnExit,
  serving,
} from "@internal/test-session";
import { Hono } from "hono";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { serve } from "./serve.ts";

/** A Hono app whose every route answers 404 with its path. */
function app(): Hono {
  return new Hono().all("*", (c) => c.text(`app: ${c.req.path}`, 404));
}

/** A react-hono build: the server's bundle beside the client's files. */
const reactHono = {
  "dist/serve.js": "the server's bundle",
  "dist/assets/page.css": "body {}",
  "dist/.vite/manifest.json": "{}",
  "public/robots.txt": "User-agent: *",
};

/** Admin's build: the client's files and Vite's manifest in dist/client. */
const admin = {
  "dist/client/assets/main.js": "export {};",
  "dist/client/.vite/manifest.json": "{}",
};

describe("@robkit/hono/serve", () => {
  it("answers the client's files, then the app, from the app's own folder", async () => {
    const folder = await builtApp(reactHono);
    const { port } = await serving(folder, () => serve(app()));

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
        type: "text/plain; charset=UTF-8",
        sniff: "nosniff",
        body: "app: /notes",
      },
    ]);
  });

  it.each([
    "/serve.js",
    "/.vite/manifest.json",
    "/assets/../serve.js",
    "/assets/%2e%2e/serve.js",
    "/assets/..%2f.vite/manifest.json",
  ])("never answers %s with a file of the build", async (path) => {
    const folder = await builtApp(reactHono);
    const { port } = await serving(folder, () => serve(app()));

    const { status, body } = await answerAt(port, path);

    expect({ status, body: body.startsWith("app: ") }).toEqual({
      status: 404,
      body: true,
    });
  });

  it("answers admin's client files from the folder it names, and never its manifest", async () => {
    const folder = await builtApp(admin);
    const { port } = await serving(folder, () =>
      serve(app(), { assets: "dist/client/assets", name: "admin" }),
    );

    expect([
      (await answerAt(port, "/assets/main.js")).type,
      (await answerAt(port, "/.vite/manifest.json")).status,
      (await answerAt(port, "/assets/../.vite/manifest.json")).status,
      (await answerAt(port, "/client/.vite/manifest.json")).status,
    ]).toEqual(["text/javascript; charset=utf-8", 404, 404, 404]);
  });

  it("gives back the Node server, listening on HOST and PORT, which a test can close", async () => {
    const folder = await builtApp({});
    const { server, port } = await serving(folder, () => serve(app()));

    expect(server.address()).toMatchObject({ address: "127.0.0.1", port });
    server.close();
    await once(server, "close");
    expect(server.listening).toBe(false);
  });

  it("refuses a malformed PORT with the reader's message", () => {
    vi.stubEnv("PORT", "web");
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });

    expect(printedOnExit(() => serve(app()))).toBe(
      `PORT is "web", which isn't a port. Set it to a whole number from 1 to 65535, or leave it unset for 3000.`,
    );
  });
});
