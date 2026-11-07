import { join } from "node:path";
import { Linter } from "eslint";
import globals from "globals";
import { describe, expect, it } from "vitest";
import layer, { coreRows, reachesOutside, repoRoot } from "./layers.js";

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

/** @param {string} name */
const offCore = (name) =>
  `Layer rule: ${name} never imports @robkit/core. Code reaches core over HTTP only.`;
const adapters = offCore("@robkit/hono");
const noIo = "Layer rule: @robkit/guard does no I/O.";
const inputNoIo = "Layer rule: @robkit/input does no I/O.";

describe("coreRows", () => {
  it("keeps every package the graph doesn't let take core off it", () => {
    const rows = coreRows(
      {
        "@robkit/core": { dependencies: [], devDependencies: [] },
        "@robkit/hono": { dependencies: [], devDependencies: [] },
        "@internal/checks": {
          dependencies: [],
          devDependencies: ["@robkit/core"],
        },
      },
      new Map([
        ["@robkit/core", "packages/core"],
        ["@robkit/hono", "packages/hono"],
        ["@internal/checks", "tooling/checks"],
      ]),
    );

    expect(
      rows.map(({ applies, ...row }) => ({
        ...row,
        hono: applies("packages/hono"),
        checks: applies("tooling/checks"),
        core: applies("packages/core"),
      })),
    ).toEqual([
      {
        rule: offCore("@robkit/hono"),
        modules: ["@robkit/core"],
        folders: ["packages/core"],
        hono: true,
        checks: false,
        core: false,
      },
    ]);
  });
});

describe("the layer rule", () => {
  it.each([
    ["packages/hono", "@robkit/hono"],
    ["packages/express", "@robkit/express"],
    ["packages/start", "@robkit/start"],
    ["packages/react", "@robkit/react"],
    ["packages/session", "@robkit/session"],
    ["packages/dev", "@robkit/dev"],
    ["tooling/e2e", "@internal/e2e"],
  ])("keeps %s off @robkit/core, as the package graph does", (folder, name) => {
    expect(lint(folder, 'import { app } from "@robkit/core";')).toEqual([
      offCore(name),
    ]);
  });

  it("lets the repo checks, which the graph lets take core, import it", () => {
    expect(
      lint("tooling/repo-checks", 'import { app } from "@robkit/core";'),
    ).toEqual([]);
  });

  it("catches a dynamic import and a re-export of @robkit/core", () => {
    expect(
      lint("packages/hono", 'await import("@robkit/core/app.ts");'),
    ).toEqual([adapters]);
    expect(lint("packages/hono", 'export * from "@robkit/core";')).toEqual([
      adapters,
    ]);
  });

  it("catches a relative path into core's source", () => {
    expect(lint("packages/hono", 'import "../../core/src/app.ts";')).toEqual([
      adapters,
    ]);
    expect(lint("packages/hono", 'import "./guard.ts";')).toEqual([]);
  });

  it.each([
    ["packages/guard", "../../session/src/input.ts"],
    ["packages/hono", "../../../tooling/test-session/src/index.ts"],
    ["tooling/test-session", "../../../packages/guard/src/guard.ts"],
    ["tooling/e2e", "../../../package.json"],
  ])(
    "catches a relative import out of %s, with graph-check's message",
    (workspace, specifier) => {
      expect(lint(workspace, `import "${specifier}";`)).toEqual([
        `Layer rule: this import ${reachesOutside(workspace, specifier)}`,
      ]);
    },
  );

  it("lets a relative import stay inside its workspace", () => {
    expect(lint("packages/guard", 'import "../package.json";')).toEqual([]);
    expect(lint("packages/guard", 'import "./test/slug.ts";')).toEqual([]);
  });

  it.each([
    ["packages/session", "@robkit/session"],
    ["packages/guard", "@robkit/guard"],
    ["packages/input", "@robkit/input"],
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
  ])("keeps `%s` out of @robkit/guard and @robkit/input", (code) => {
    expect(lint("packages/guard", code)).toEqual([noIo]);
    expect(lint("packages/input", code)).toEqual([inputNoIo]);
    expect(lint("packages/dev", code)).toEqual([]);
  });

  it.each(["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "process"])(
    "keeps the %s global out of @robkit/guard and @robkit/input",
    (name) => {
      expect(lint("packages/guard", `${name};`)).toEqual([noIo]);
      expect(lint("packages/input", `${name};`)).toEqual([inputNoIo]);
      expect(lint("packages/dev", `${name};`)).toEqual([]);
    },
  );

  it("lets the guard shadow a banned global with its own name", () => {
    expect(lint("packages/guard", "const fetch = 1; fetch;")).toEqual([]);
    expect(lint("packages/guard", "fetch;")).toEqual([noIo]);
  });
});
