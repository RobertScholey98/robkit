import { createServer as createNetServer } from "node:net";
import { once } from "node:events";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { build, resolveConfig, type Plugin } from "vite";
import { robkit } from "./index.ts";
import {
  answer,
  appFolder,
  devServer,
  freePort,
  settings,
} from "./test/dev-server.ts";

beforeEach(() => {
  // Vitest sets VITEST for its own run. Each test says whether it wants it.
  vi.stubEnv("VITEST", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * A resolved config's settings, without the functions in it, which differ
 * between two resolves of the same config.
 */
function settled(config: object): unknown {
  return JSON.parse(JSON.stringify(config));
}

describe("robkit()", () => {
  it("listens on 127.0.0.1 at PORT and answers the install's host names", async () => {
    const port = await freePort();
    settings({ PORT: String(port) });
    const server = await devServer([robkit()]);

    const address = server.httpServer?.address();
    const app = await answer(port, "notes.robkit.test");
    const stranger = await answer(port, "notes.example.com");

    expect(address).toMatchObject({ address: "127.0.0.1", port });
    expect(app.status).toBe(200);
    expect(stranger.status).toBe(403);
  });

  it("won't move to another port when PORT is taken", async () => {
    const taken = createNetServer().listen(0, "127.0.0.1");
    await once(taken, "listening");
    const address = taken.address();
    const port = typeof address === "object" && address ? address.port : 0;
    settings({ PORT: String(port) });

    try {
      await expect(devServer([robkit()])).rejects.toThrow(
        `Port ${String(port)} is already in use`,
      );
    } finally {
      taken.close();
    }
  });

  it.each(["ROBKIT_APP", "ROBKIT_CORE_URL"])(
    "fails as the dev server starts when %s is missing, naming it",
    async (name) => {
      settings({ PORT: String(await freePort()), [name]: undefined });

      await expect(devServer([robkit()])).rejects.toThrow(
        `${name} is not set.`,
      );
    },
  );

  it("checks nothing for a build", async () => {
    settings({ ROBKIT_APP: undefined, ROBKIT_CORE_URL: undefined });

    const config = await resolveConfig(
      { configFile: false, logLevel: "silent", plugins: [robkit()] },
      "build",
    );

    expect(config.server.allowedHosts).toEqual([]);
  });

  it("sends no header of its own", async () => {
    const port = await freePort();
    settings({ PORT: String(port) });
    await devServer([robkit()]);

    const page = await answer(port, "notes.robkit.test");

    expect({
      frame: page.headers.get("x-frame-options"),
      policy: page.headers.get("content-security-policy"),
      sniff: page.headers.get("x-content-type-options"),
    }).toEqual({ frame: null, policy: null, sniff: null });
  });
});

describe("robkit({ serve }), for a server Vite builds", () => {
  it("builds the server to dist/serve.js and the page's stylesheet to dist/assets", async () => {
    const root = await appFolder({
      "package.json": '{ "type": "module" }\n',
      "src/page.css": "p { color: rebeccapurple; }\n",
      "src/serve.ts":
        'import "./page.css";\nexport const page = "<p>hi</p>";\n',
    });

    await build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [robkit({ serve: "src/serve.ts" })],
    });

    expect({
      dist: await readdir(join(root, "dist")),
      assets: (await readdir(join(root, "dist", "assets"))).map((name) =>
        name.replace(/-[\w-]+\.css$/, ".css"),
      ),
    }).toEqual({ dist: ["assets", "serve.js"], assets: ["serve.css"] });
  });

  it("changes nothing under pnpm dev or Vitest", async () => {
    const port = await freePort();
    const devConfig = async (plugin: Plugin) => {
      const config = await resolveConfig(
        { configFile: false, logLevel: "silent", plugins: [plugin] },
        "serve",
      );
      return settled({ build: config.build, server: config.server });
    };

    settings({ PORT: String(port) });
    const dev = await devConfig(robkit({ serve: "src/serve.ts" }));
    const devWithout = await devConfig(robkit());
    settings({ VITEST: "true" });
    const vitest = await devConfig(robkit({ serve: "src/serve.ts" }));
    const vitestWithout = await devConfig(robkit());

    expect({ dev, vitest }).toEqual({ dev: devWithout, vitest: vitestWithout });
  });

  it("still sets the layout for a vite build that a test starts", async () => {
    settings({ VITEST: "true" });

    const config = await resolveConfig(
      {
        configFile: false,
        logLevel: "silent",
        plugins: [robkit({ serve: "src/serve.ts" })],
      },
      "build",
    );

    expect(config.build.ssr).toBe("src/serve.ts");
  });
});

describe("robkit({ guarded: false }), for the hub", () => {
  it("starts with no guard settings and sends the hub's three headers", async () => {
    const port = await freePort();
    settings({
      PORT: String(port),
      ROBKIT_APP: undefined,
      ROBKIT_CORE_URL: undefined,
    });
    await devServer([robkit({ guarded: false })]);

    const page = await answer(port, "hub.robkit.test");

    expect({
      status: page.status,
      frame: page.headers.get("x-frame-options"),
      policy: page.headers.get("content-security-policy"),
      sniff: page.headers.get("x-content-type-options"),
      hsts: page.headers.get("strict-transport-security"),
    }).toEqual({
      status: 200,
      frame: "DENY",
      policy: "frame-ancestors 'none'",
      sniff: "nosniff",
      hsts: null,
    });
  });
});

describe("robkit() under Vitest", () => {
  it.each([
    ["robkit()", robkit],
    ["robkit({ guarded: false })", () => robkit({ guarded: false })],
  ])(
    "%s changes nothing in the config it is given, with no settings at all",
    async (_, plugin) => {
      settings({
        VITEST: "true",
        PORT: "4123",
        ROBKIT_APP: undefined,
        ROBKIT_CORE_URL: undefined,
      });
      const given = { configFile: false as const, logLevel: "silent" as const };

      const without = await resolveConfig(given, "serve");
      const withIt = await resolveConfig(
        { ...given, plugins: [plugin()] },
        "serve",
      );

      expect(withIt.server).toEqual(without.server);
    },
  );

  it("sends no header under Vitest, even for the hub", async () => {
    const port = await freePort();
    settings({ VITEST: "true", ROBKIT_APP: undefined });
    await devServer([robkit({ guarded: false })], {
      host: "127.0.0.1",
      port,
      strictPort: true,
    });

    const page = await answer(port, "localhost");

    expect(page.headers.get("x-frame-options")).toBeNull();
  });
});
