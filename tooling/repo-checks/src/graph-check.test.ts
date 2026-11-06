import { fileURLToPath } from "node:url";
import { layers } from "@internal/eslint-config/layers";
import { describe, expect, it } from "vitest";
import {
  cycles,
  importProblems,
  importsIn,
  importsUnder,
  layerConflicts,
  layerForbids,
  manifestProblems,
  readWorkspace,
  type LayerRow,
  type WorkspacePackage,
} from "./graph-check.ts";
import {
  packageGraph,
  type PackageGraph,
} from "@internal/eslint-config/package-graph";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const graphFile = "tooling/eslint/package-graph.js";

const guard: WorkspacePackage = {
  name: "@robkit/guard",
  folder: "packages/guard",
  manifest: {},
};
const core: WorkspacePackage = {
  name: "@robkit/core",
  folder: "packages/core",
  manifest: { dependencies: { "@robkit/guard": "workspace:*" } },
};
const hono: WorkspacePackage = {
  name: "@robkit/hono",
  folder: "packages/hono",
  manifest: {
    dependencies: { "@robkit/guard": "workspace:*", hono: "catalog:" },
    devDependencies: { "@internal/tsconfig": "workspace:*" },
  },
};
const tsconfig: WorkspacePackage = {
  name: "@internal/tsconfig",
  folder: "tooling/typescript",
  manifest: {},
};
const packages = [guard, core, hono, tsconfig];

const graph: PackageGraph = {
  "@robkit/guard": { dependencies: [], devDependencies: [] },
  "@robkit/core": { dependencies: ["@robkit/guard"], devDependencies: [] },
  "@robkit/hono": { dependencies: ["@robkit/guard"], devDependencies: [] },
  "@internal/tsconfig": { dependencies: [], devDependencies: [] },
};

describe("manifestProblems", () => {
  it("accepts manifests that match the graph, and the toolchain", () => {
    expect(manifestProblems(graph, packages)).toEqual([]);
  });

  it("rejects a workspace dependency the graph doesn't allow", () => {
    const reaching = {
      ...hono,
      manifest: {
        ...hono.manifest,
        dependencies: {
          ...hono.manifest.dependencies,
          "@robkit/core": "workspace:*",
        },
      },
    };

    expect(manifestProblems(graph, [guard, core, reaching, tsconfig])).toEqual([
      `packages/hono/package.json: dependencies has @robkit/core, which ${graphFile} doesn't let @robkit/hono depend on`,
    ]);
  });

  it("rejects a runtime dependency the graph allows only in tests", () => {
    const testOnly: PackageGraph = {
      ...graph,
      "@robkit/hono": {
        dependencies: [],
        devDependencies: ["@robkit/guard"],
      },
    };

    expect(manifestProblems(testOnly, packages)).toEqual([
      `packages/hono/package.json: dependencies has @robkit/guard, which ${graphFile} doesn't let @robkit/hono depend on`,
      `${graphFile} lets @robkit/hono take @robkit/guard in devDependencies, but packages/hono/package.json doesn't`,
    ]);
  });

  it("rejects an edge no manifest has, and packages the graph and workspace don't share", () => {
    const stale: PackageGraph = {
      ...graph,
      "@robkit/guard": {
        dependencies: ["@internal/tsconfig"],
        devDependencies: [],
      },
      "@robkit/gone": { dependencies: [], devDependencies: [] },
    };
    const extra = { name: "@robkit/new", folder: "packages/new", manifest: {} };

    expect(manifestProblems(stale, [...packages, extra])).toEqual([
      `${graphFile} names @robkit/gone, which isn't a workspace package`,
      `${graphFile} lets @robkit/guard take @internal/tsconfig in dependencies, but packages/guard/package.json doesn't`,
      `packages/new: @robkit/new isn't in ${graphFile}`,
    ]);
  });
});

describe("importProblems", () => {
  it("rejects an import of a workspace package the graph doesn't allow", () => {
    const imports = [
      { file: "packages/hono/src/a.ts", line: 1, specifier: "@robkit/guard" },
      { file: "packages/hono/src/a.ts", line: 2, specifier: "hono/cookie" },
      { file: "packages/hono/src/a.ts", line: 3, specifier: "@robkit/hono" },
      { file: "packages/hono/src/a.ts", line: 4, specifier: "@robkit/core/x" },
    ];

    expect(importProblems(graph, hono, packages, imports)).toEqual([
      `packages/hono/src/a.ts:4 imports @robkit/core, which ${graphFile} doesn't let @robkit/hono depend on`,
    ]);
  });

  it("rejects a relative import that leaves the package", () => {
    const imports = [
      { file: "packages/hono/src/a.ts", line: 1, specifier: "./b.ts" },
      { file: "packages/hono/src/a.ts", line: 2, specifier: "../package.json" },
      {
        file: "packages/hono/src/a.ts",
        line: 3,
        specifier: "../../core/src/index.ts",
      },
    ];

    expect(importProblems(graph, hono, packages, imports)).toEqual([
      "packages/hono/src/a.ts:3 reaches outside packages/hono with ../../core/src/index.ts. Import the package by name.",
    ]);
  });
});

describe("importProblems on runtime code", () => {
  const testPostgres: WorkspacePackage = {
    name: "@internal/test-postgres",
    folder: "tooling/test-postgres",
    manifest: { private: true },
  };
  const coreWithTests: WorkspacePackage = {
    ...core,
    manifest: {
      ...core.manifest,
      devDependencies: { "@internal/test-postgres": "workspace:*" },
    },
  };
  const testSession: WorkspacePackage = {
    name: "@internal/test-session",
    folder: "tooling/test-session",
    manifest: {
      private: true,
      devDependencies: { "@robkit/guard": "workspace:*" },
    },
  };
  const all = [...packages, testPostgres, testSession];
  const withTests: PackageGraph = {
    ...graph,
    "@robkit/core": {
      dependencies: ["@robkit/guard"],
      devDependencies: ["@internal/test-postgres"],
    },
    "@internal/test-postgres": { dependencies: [], devDependencies: [] },
    "@internal/test-session": {
      dependencies: [],
      devDependencies: ["@robkit/guard"],
    },
  };
  const importing = (file: string) => ({
    file,
    line: 1,
    specifier: "@internal/test-postgres",
  });

  it("rejects a dev-only package imported from a runtime file", () => {
    expect(
      importProblems(withTests, coreWithTests, all, [
        importing("packages/core/src/app.ts"),
      ]),
    ).toEqual([
      `packages/core/src/app.ts:1 imports @internal/test-postgres, which ${graphFile} lets @robkit/core take only in tests and config`,
    ]);
  });

  it("accepts a dev-only package in tests, test helpers and config", () => {
    expect(
      importProblems(
        withTests,
        coreWithTests,
        all,
        [
          "packages/core/src/app.test.ts",
          "packages/core/src/types.test-d.ts",
          "packages/core/src/test/global-setup.ts",
          "packages/core/src/__snapshots__/x.ts",
          "packages/core/vitest.config.ts",
          "packages/core/drizzle.config.ts",
        ].map(importing),
      ),
    ).toEqual([]);
  });

  it("accepts dev edges anywhere in a private package, which has no runtime", () => {
    expect(
      importProblems(withTests, testSession, all, [
        {
          file: "tooling/test-session/src/index.ts",
          line: 1,
          specifier: "@robkit/guard",
        },
      ]),
    ).toEqual([]);
  });
});

describe("cycles", () => {
  it("finds none in an acyclic graph", () => {
    expect(cycles(graph)).toEqual([]);
  });

  it("names a cycle through any kind of edge", () => {
    expect(
      cycles({
        ...graph,
        "@robkit/guard": {
          dependencies: [],
          devDependencies: ["@robkit/hono"],
        },
      }),
    ).toEqual(["@robkit/guard -> @robkit/hono -> @robkit/guard"]);
  });
});

describe("importsIn", () => {
  it("finds static, type, re-exported, dynamic and required imports", () => {
    const text = [
      'import { a } from "@robkit/guard";',
      'import type { B } from "./b.ts";',
      'export * from "@robkit/session/lapsed";',
      'const c = await import("@robkit/core");',
      'const d = require("jose");',
      'const e = "import \\"@robkit/start\\"";',
    ].join("\n");

    expect(importsIn("packages/x/src/a.ts", text)).toEqual(
      [
        [1, "@robkit/guard"],
        [2, "./b.ts"],
        [3, "@robkit/session/lapsed"],
        [4, "@robkit/core"],
        [5, "jose"],
      ].map(([line, specifier]) => ({
        file: "packages/x/src/a.ts",
        line,
        specifier,
      })),
    );
  });
});

describe("layerConflicts", () => {
  const noCore: LayerRow = {
    applies: (workspace) => workspace === "packages/hono",
    rule: "Layer rule: hono never imports core.",
    modules: ["@robkit/core"],
  };
  const noCoreFolder: LayerRow = {
    ...noCore,
    modules: [],
    folders: ["packages/core"],
  };

  it("rejects an edge the graph allows and the layer rule forbids, by name or folder", () => {
    const reaching: PackageGraph = {
      ...graph,
      "@robkit/hono": {
        dependencies: ["@robkit/guard"],
        devDependencies: ["@robkit/core"],
      },
    };

    for (const row of [noCore, noCoreFolder]) {
      expect(layerConflicts(reaching, layerForbids(packages, [row]))).toEqual([
        `${graphFile} lets @robkit/hono depend on @robkit/core, which the layer ESLint rule forbids: Layer rule: hono never imports core.`,
      ]);
    }
  });

  it("accepts a graph without the forbidden edge", () => {
    expect(layerConflicts(graph, layerForbids(packages, [noCore]))).toEqual([]);
  });
});

describe("the robkit workspace", () => {
  it("agrees with the layer ESLint rule, whose core rows it feeds", async () => {
    const forbidden = layerForbids(await readWorkspace(root), layers);

    expect(forbidden.map(({ from, to }) => `${from} -> ${to}`)).toEqual([
      "create-robkit -> @robkit/core",
      "@robkit/dev -> @robkit/core",
      "@robkit/guard -> @robkit/core",
      "@robkit/hono -> @robkit/core",
      "@robkit/react -> @robkit/core",
      "@robkit/session -> @robkit/core",
      "@robkit/start -> @robkit/core",
      "@internal/e2e -> @robkit/core",
      "@internal/eslint-config -> @robkit/core",
      "@internal/test-addresses -> @robkit/core",
      "@internal/test-postgres -> @robkit/core",
      "@internal/test-session -> @robkit/core",
      "@internal/tsconfig -> @robkit/core",
    ]);
    expect(layerConflicts(packageGraph, forbidden)).toEqual([]);
  });

  it("names every package in the graph, and every manifest keeps to it", async () => {
    expect(manifestProblems(packageGraph, await readWorkspace(root))).toEqual(
      [],
    );
  });

  it("imports only what the graph allows", async () => {
    const packages = await readWorkspace(root);
    const problems: string[] = [];
    for (const pkg of packages) {
      const imports = await importsUnder(root, pkg.folder);
      problems.push(...importProblems(packageGraph, pkg, packages, imports));
    }

    expect(problems).toEqual([]);
  });

  it("has no cycle", () => {
    expect(cycles(packageGraph)).toEqual([]);
  });
});
