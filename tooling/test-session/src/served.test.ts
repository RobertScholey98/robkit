import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { answerAt, builtApp, serving } from "./served.ts";

describe("serving", () => {
  it("starts a server from the app's folder on PORT, and answers a path as written", async () => {
    const folder = await builtApp({ "dist/page.txt": "the page" });
    let seen = "";

    const { port } = await serving(folder, () => {
      seen = process.cwd();
      const server = createServer((request, response) => {
        response.setHeader("x-content-type-options", "nosniff");
        response.setHeader("content-type", "text/plain");
        response.end(`${String(request.method)} ${String(request.url)}`);
      });
      // A line the test's output doesn't show.
      return server.listen(Number(process.env.PORT), process.env.HOST, () => {
        console.log("listening");
      });
    });

    expect({
      seen,
      file: await readFile(join(folder, "dist/page.txt"), "utf8"),
      answer: await answerAt(port, "/a/../b", "HEAD"),
      get: await answerAt(port, "/a/../b"),
    }).toEqual({
      seen: folder,
      file: "the page",
      answer: { status: 200, type: "text/plain", sniff: "nosniff", body: "" },
      get: {
        status: 200,
        type: "text/plain",
        sniff: "nosniff",
        body: "GET /a/../b",
      },
    });
  });

  it("waits for a server that is already listening, and reads a missing header as null", async () => {
    const folder = await builtApp({});

    const { port } = await serving(folder, async () => {
      const server = createServer((_request, response) => response.end());
      server.listen(Number(process.env.PORT), process.env.HOST);
      await once(server, "listening");
      return server;
    });

    expect(await answerAt(port, "/")).toEqual({
      status: 200,
      type: null,
      sniff: null,
      body: "",
    });
  });
});
