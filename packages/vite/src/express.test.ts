import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expressApp } from "./express.ts";
import { appFolder, answer, devServer, freePort } from "./test/dev-server.ts";

afterEach(() => {
  vi.unstubAllEnvs();
});

/** A server entry whose app answers every request with `text`. */
const entry = (text: string) =>
  [
    "export default function app(req, res) {",
    `  res.end(${JSON.stringify(text)} + " at " + req.url);`,
    "}",
    "",
  ].join("\n");

/** Vite's dev server on `root` with `expressApp`, listening on a free port. */
async function serve(root: string) {
  const port = await freePort();
  const vite = await devServer(
    [expressApp("/server.js")],
    {
      host: "127.0.0.1",
      port,
      strictPort: true,
    },
    root,
  );
  return { vite, ask: (path = "/") => answer(port, "localhost", path) };
}

describe("expressApp(entry)", () => {
  it("hands every page to the app, though the config sets no appType", async () => {
    const root = await appFolder({ "server.js": entry("the app") });
    const { vite, ask } = await serve(root);

    const page = await ask("/");
    const other = await ask("/notes/1");

    expect(vite.config.appType).toBe("custom");
    expect([page.body, other.body]).toEqual([
      "the app at /",
      "the app at /notes/1",
    ]);
  });

  it("leaves Vite's own requests to Vite", async () => {
    const root = await appFolder({ "server.js": entry("the app") });
    const { ask } = await serve(root);

    const client = await ask("/@vite/client");

    expect(client.status).toBe(200);
    expect(client.headers.get("content-type")).toMatch(/javascript/);
  });

  it("loads the app again after its server changes, with no restart", async () => {
    const root = await appFolder({ "server.js": entry("before") });
    const { ask } = await serve(root);
    expect((await ask()).body).toBe("before at /");

    await writeFile(join(root, "server.js"), entry("after"));

    await expect
      .poll(async () => (await ask()).body, { timeout: 10_000 })
      .toBe("after at /");
  });

  it("answers 500, saying what's wrong, when the entry exports no app", async () => {
    const root = await appFolder({ "server.js": "export default 42;\n" });
    const { ask } = await serve(root);

    const page = await ask();

    expect(page.status).toBe(500);
    expect(page.body).toContain(
      "/server.js must export its Express app as default.",
    );
  });
});
