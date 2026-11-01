import { Linter } from "eslint";
import globals from "globals";
import { describe, expect, it } from "vitest";
import { layerConfig } from "./layers.js";

/**
 * Lints one line of source as if it sat in `workspace`.
 * @param {string} workspace
 * @param {string} code
 */
function lint(workspace, code) {
  return new Linter()
    .verify(
      code,
      [
        {
          files: ["**/*.ts"],
          languageOptions: {
            globals: { ...globals.node, ...globals.browser },
          },
        },
        layerConfig(workspace),
      ],
      "src/index.ts",
    )
    .map((m) => m.message);
}

describe("layerConfig", () => {
  it("lets only apps/core import @robkit/core", () => {
    expect(lint("apps/hub", 'import "@robkit/core";')).toEqual([
      "'@robkit/core' import is restricted from being used by a pattern. Layer rule: only apps/core imports @robkit/core. Code reaches core over HTTP only.",
    ]);
    expect(lint("apps/core", 'import "@robkit/core";')).toEqual([]);
  });

  it.each(["packages/hono", "packages/start", "packages/react"])(
    "keeps the %s adapter off @robkit/core",
    (adapter) => {
      expect(lint(adapter, 'import { app } from "@robkit/core";')).toEqual([
        "'@robkit/core' import is restricted from being used by a pattern. Layer rule: adapters never import @robkit/core. Code reaches core over HTTP only.",
      ]);
      expect(lint("apps/core", 'import { app } from "@robkit/core";')).toEqual(
        [],
      );
    },
  );

  it.each([
    ["packages/session", "@robkit/session"],
    ["packages/guard", "@robkit/guard"],
  ])("keeps frameworks out of %s", (workspace, name) => {
    const message = `Layer rule: ${name} imports no framework.`;
    for (const framework of [
      "hono",
      "hono/cors",
      "@hono/node-server",
      "react",
      "react-dom/client",
      "@tanstack/react-start",
      "next/server",
      "express",
    ]) {
      expect(lint(workspace, `import "${framework}";`)).toEqual([
        `'${framework}' import is restricted from being used by a pattern. ${message}`,
      ]);
      expect(lint("packages/hono", `import "${framework}";`)).toEqual([]);
    }
  });

  it("matches framework names exactly, not as a suffix", () => {
    expect(lint("packages/session", 'import "react";')).toEqual([
      "'react' import is restricted from being used by a pattern. Layer rule: @robkit/session imports no framework.",
    ]);
    expect(lint("packages/session", 'import "@robkit/react";')).toEqual([]);
  });

  it.each(["fs", "node:fs", "fs/promises", "node:http", "child_process"])(
    "keeps %s out of @robkit/guard",
    (builtin) => {
      expect(lint("packages/guard", `import "${builtin}";`)).toEqual([
        `'${builtin}' import is restricted from being used by a pattern. Layer rule: @robkit/guard does no I/O.`,
      ]);
      expect(lint("packages/dev", `import "${builtin}";`)).toEqual([]);
    },
  );

  it.each(["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "process"])(
    "keeps the %s global out of @robkit/guard",
    (name) => {
      expect(lint("packages/guard", `${name};`)).toEqual([
        `Unexpected use of '${name}'. Layer rule: @robkit/guard does no I/O.`,
      ]);
      expect(lint("packages/dev", `${name};`)).toEqual([]);
    },
  );

  it.each([
    "@internal/hub-app",
    "../../apps/hub/src/App.tsx",
    "../../../examples/notes/src/index.ts",
  ])("keeps packages from importing %s", (source) => {
    expect(lint("packages/dev", `import "${source}";`)).toEqual([
      `'${source}' import is restricted from being used by a pattern. Layer rule: packages never import from apps or examples.`,
    ]);
    expect(lint("tooling/e2e", `import "${source}";`)).toEqual([]);
  });

  it("lets a package import its own folder named apps", () => {
    expect(
      lint("packages/dev", 'import "./test/fixture-install/apps/alpha/x.ts";'),
    ).toEqual([]);
    expect(
      lint("packages/dev", 'import "../../apps/hub/src/App.tsx";'),
    ).toEqual([
      "'../../apps/hub/src/App.tsx' import is restricted from being used by a pattern. Layer rule: packages never import from apps or examples.",
    ]);
  });
});
