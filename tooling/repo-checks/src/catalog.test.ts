import { describe, expect, it } from "vitest";
import {
  findUncataloguedDependencies,
  readWorkspaceManifests,
} from "./catalog.ts";

describe("findUncataloguedDependencies", () => {
  it("reports versions pinned outside the catalog", () => {
    const violations = findUncataloguedDependencies([
      {
        path: "packages/guard/package.json",
        json: {
          dependencies: { jose: "^6.0.0" },
          devDependencies: { vitest: "5.0.5" },
          optionalDependencies: { fsevents: "*" },
        },
      },
    ]);

    expect(violations).toEqual([
      {
        path: "packages/guard/package.json",
        field: "dependencies",
        name: "jose",
        spec: "^6.0.0",
      },
      {
        path: "packages/guard/package.json",
        field: "devDependencies",
        name: "vitest",
        spec: "5.0.5",
      },
      {
        path: "packages/guard/package.json",
        field: "optionalDependencies",
        name: "fsevents",
        spec: "*",
      },
    ]);
  });

  it("accepts catalog and workspace references", () => {
    const violations = findUncataloguedDependencies([
      {
        path: "packages/core/package.json",
        json: {
          dependencies: {
            hono: "catalog:",
            react: "catalog:react19",
            "@robkit/guard": "workspace:*",
          },
        },
      },
    ]);

    expect(violations).toEqual([]);
  });

  it("leaves peer dependency ranges alone", () => {
    const violations = findUncataloguedDependencies([
      {
        path: "tooling/eslint/package.json",
        json: { peerDependencies: { eslint: "^10.0.0" } },
      },
    ]);

    expect(violations).toEqual([]);
  });
});

describe("the robkit workspace", () => {
  it("takes every external version from the catalog", async () => {
    const root = new URL("../../../", import.meta.url).pathname;
    const manifests = await readWorkspaceManifests(root);

    expect(manifests.map((m) => m.path)).toContain("package.json");
    expect(findUncataloguedDependencies(manifests)).toEqual([]);
  });
});
