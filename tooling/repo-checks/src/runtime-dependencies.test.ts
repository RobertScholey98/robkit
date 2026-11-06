import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  readTemplates,
  runtimeDependencyProblems,
  runtimeImports,
} from "./runtime-dependencies.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));

function manifest(fields: object): string {
  return JSON.stringify(fields);
}

/** An app at `apps/hub` that starts with `node serve.ts`. */
function hub(
  dependencies: Record<string, string>,
  devDependencies: Record<string, string> = {},
): [string, string] {
  return [
    "apps/hub/package.json",
    manifest({
      scripts: { start: "node serve.ts" },
      dependencies,
      devDependencies,
    }),
  ];
}

const missing = (file: string, name: string, dir: string) =>
  `${file} imports ${name} when it runs, but ${dir}/package.json doesn't list it under dependencies, so a production image won't have it. Move it to dependencies.`;

describe("runtimeDependencyProblems", () => {
  it("fails a server that imports a dev dependency", () => {
    const files = new Map([
      hub({ hono: "catalog:" }, { "@robkit/input": "catalog:" }),
      [
        "apps/hub/serve.ts",
        'import { Hono } from "hono";\nimport { orExit } from "@robkit/input";\n',
      ],
    ]);

    expect(runtimeDependencyProblems(files)).toEqual([
      missing("apps/hub/serve.ts", "@robkit/input", "apps/hub"),
    ]);
  });

  it("passes the same server once the package is a dependency", () => {
    const files = new Map([
      hub({ hono: "catalog:", "@robkit/input": "catalog:" }),
      [
        "apps/hub/serve.ts",
        'import { Hono } from "hono";\nimport { orExit } from "@robkit/input/report";\n',
      ],
    ]);

    expect(runtimeDependencyProblems(files)).toEqual([]);
  });

  it("follows relative imports, and leaves what only Vite bundles alone", () => {
    const files = new Map([
      hub({}, { react: "catalog:", vite: "catalog:" }),
      ["apps/hub/serve.ts", 'import "./server.js";\n'],
      ["apps/hub/server.ts", 'export { x } from "./routes/page.tsx";\n'],
      ["apps/hub/routes/page.tsx", 'import { useState } from "react";\n'],
      // Not reached from serve.ts: the page Vite builds.
      ["apps/hub/src/main.tsx", 'import { createRoot } from "react-dom";\n'],
    ]);

    expect(runtimeDependencyProblems(files)).toEqual([
      missing("apps/hub/routes/page.tsx", "react", "apps/hub"),
    ]);
  });

  it("starts from each node command, through node --run and env", () => {
    const files = new Map([
      [
        "apps/core/package.json",
        manifest({
          scripts: {
            start:
              "node --run migrate && env -u SECRET node --env-file=.env src/main.ts",
            migrate: "node src/migrate.ts",
          },
        }),
      ],
      ["apps/core/src/main.ts", 'import "a";\n'],
      ["apps/core/src/migrate.ts", 'import "b";\n'],
    ]);

    expect(runtimeDependencyProblems(files)).toEqual([
      missing("apps/core/src/main.ts", "a", "apps/core"),
      missing("apps/core/src/migrate.ts", "b", "apps/core"),
    ]);
  });

  it("reads a built dist/<name>.js from src/<name>.ts", () => {
    const files = new Map([
      [
        "stacks/app/package.json",
        manifest({ scripts: { start: "node dist/serve.js" } }),
      ],
      ["stacks/app/src/serve.ts", 'import "hono";\n'],
    ]);

    expect(runtimeDependencyProblems(files)).toEqual([
      missing("stacks/app/src/serve.ts", "hono", "stacks/app"),
    ]);
  });

  it("says when a start script's file has no source", () => {
    const files = new Map([
      [
        "apps/x/package.json",
        manifest({ scripts: { start: "node dist/gone.js" } }),
      ],
    ]);

    expect(runtimeDependencyProblems(files)).toEqual([
      "apps/x/package.json starts dist/gone.js, which has no source file in the template. Check the start script, or teach tooling/repo-checks/src/runtime-dependencies.ts where its source is.",
    ]);
  });

  it("follows a workspace package's exports, against its own manifest", () => {
    const files = new Map([
      hub({ "@internal/ui": "workspace:*" }),
      [
        "apps/hub/serve.ts",
        'import { Card } from "@internal/ui/components/ui/card";\n',
      ],
      [
        "packages/ui/package.json",
        manifest({
          name: "@internal/ui",
          exports: { "./components/ui/*": "./src/components/ui/*.tsx" },
          dependencies: { "class-variance-authority": "catalog:" },
          peerDependencies: { react: "*" },
          devDependencies: { "@base-ui/react": "catalog:" },
        }),
      ],
      [
        "packages/ui/src/components/ui/card.tsx",
        'import { cva } from "class-variance-authority";\nimport * as React from "react";\nimport { Button } from "@base-ui/react";\n',
      ],
    ]);

    expect(runtimeDependencyProblems(files)).toEqual([
      missing(
        "packages/ui/src/components/ui/card.tsx",
        "@base-ui/react",
        "packages/ui",
      ),
    ]);
  });

  it("finds nothing in create-robkit's templates", async () => {
    const files = await readTemplates(root);

    // The walk reached the servers that matter, not just nothing.
    expect(files.has("base/apps/hub/serve.ts")).toBe(true);
    expect(runtimeDependencyProblems(files)).toEqual([]);
  });
});

describe("runtimeImports", () => {
  it("lists what a file imports for its value, and skips types", () => {
    const code = [
      'import type { A } from "types-only";',
      'import { type B, type C } from "named-types-only";',
      'import { type D, e } from "mixed";',
      'import f from "default";',
      'import "side-effect";',
      'export { g } from "re-export";',
      'export type { H } from "type-re-export";',
      'const i = await import("dynamic");',
      "const j = await import(url);",
    ].join("\n");

    expect(runtimeImports(code, "x.ts")).toEqual([
      "mixed",
      "default",
      "side-effect",
      "re-export",
      "dynamic",
    ]);
  });

  it("skips Node's own modules in the check", () => {
    const files = new Map([
      hub({}),
      [
        "apps/hub/serve.ts",
        'import { readFile } from "node:fs/promises";\nimport { join } from "path";\n',
      ],
    ]);

    expect(runtimeDependencyProblems(files)).toEqual([]);
  });
});
