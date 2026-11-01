import { join } from "node:path";
import { Linter } from "eslint";
import globals from "globals";
import { describe, expect, it } from "vitest";
import layer, { repoRoot } from "./layers.js";

/**
 * Lints `code` as `src/index.ts` in `workspace`.
 * @param {string} workspace
 * @param {string} code
 */
function lint(workspace, code) {
  return new Linter({ cwd: repoRoot })
    .verify(
      code,
      [
        {
          files: ["**/*.ts"],
          languageOptions: {
            globals: { ...globals.node, ...globals.browser },
          },
          plugins: { robkit: { rules: { layer } } },
          rules: { "robkit/layer": "error" },
        },
      ],
      join(repoRoot, workspace, "src/index.ts"),
    )
    .map((m) => m.message);
}

const onlyCore =
  "Layer rule: only apps/core imports @robkit/core. Code reaches core over HTTP only.";
const adapters =
  "Layer rule: adapters never import @robkit/core. Code reaches core over HTTP only.";
const noIo = "Layer rule: @robkit/guard does no I/O.";
const noApps = "Layer rule: packages never import from apps or examples.";

describe("the layer rule", () => {
  it("lets only apps/core import @robkit/core", () => {
    expect(lint("apps/hub", 'import "@robkit/core";')).toEqual([onlyCore]);
    expect(lint("apps/core", 'import "@robkit/core";')).toEqual([]);
  });

  it.each(["packages/hono", "packages/start", "packages/react"])(
    "keeps the %s adapter off @robkit/core",
    (adapter) => {
      expect(lint(adapter, 'import { app } from "@robkit/core";')).toEqual([
        adapters,
      ]);
      expect(lint("apps/core", 'import { app } from "@robkit/core";')).toEqual(
        [],
      );
    },
  );

  it("catches a dynamic import and a re-export of @robkit/core", () => {
    expect(
      lint("packages/hono", 'await import("@robkit/core/app.ts");'),
    ).toEqual([adapters]);
    expect(lint("packages/hono", 'export * from "@robkit/core";')).toEqual([
      adapters,
    ]);
    expect(lint("apps/core", 'await import("@robkit/core");')).toEqual([]);
  });

  it("catches a relative path into core's source", () => {
    expect(lint("packages/hono", 'import "../../core/src/app.ts";')).toEqual([
      adapters,
    ]);
    expect(
      lint("apps/hub", 'import "../../../packages/core/src/app.ts";'),
    ).toEqual([onlyCore]);
    expect(lint("packages/hono", 'import "./guard.ts";')).toEqual([]);
  });

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
      expect(lint(workspace, `import "${framework}";`)).toEqual([message]);
      expect(lint("packages/hono", `import "${framework}";`)).toEqual([]);
    }
  });

  it("matches framework names exactly, not as a suffix", () => {
    expect(lint("packages/session", 'import "react";')).toEqual([
      "Layer rule: @robkit/session imports no framework.",
    ]);
    expect(lint("packages/session", 'import "@robkit/react";')).toEqual([]);
  });

  it.each([
    'import "fs";',
    'import "node:fs";',
    'import { readFile } from "fs/promises";',
    'await import("node:fs/promises");',
    'import "child_process";',
    'import "node:test";',
  ])("keeps `%s` out of @robkit/guard", (code) => {
    expect(lint("packages/guard", code)).toEqual([noIo]);
    expect(lint("packages/dev", code)).toEqual([]);
  });

  it.each(["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "process"])(
    "keeps the %s global out of @robkit/guard",
    (name) => {
      expect(lint("packages/guard", `${name};`)).toEqual([noIo]);
      expect(lint("packages/dev", `${name};`)).toEqual([]);
    },
  );

  it("lets the guard shadow a banned global with its own name", () => {
    expect(lint("packages/guard", "const fetch = 1; fetch;")).toEqual([]);
    expect(lint("packages/guard", "fetch;")).toEqual([noIo]);
  });

  it.each([
    'import "@internal/hub-app";',
    'import "../../../apps/hub/src/App.tsx";',
    'await import("../../../examples/notes/src/index.ts");',
  ])("keeps packages from `%s`", (code) => {
    expect(lint("packages/dev", code)).toEqual([noApps]);
    expect(lint("tooling/e2e", code)).toEqual([]);
  });

  it("lets a package import its own folder named apps", () => {
    expect(
      lint("packages/dev", 'import "./test/fixture-install/apps/alpha/x.ts";'),
    ).toEqual([]);
    expect(
      lint("packages/dev", 'import "../../../apps/hub/src/App.tsx";'),
    ).toEqual([noApps]);
  });
});
