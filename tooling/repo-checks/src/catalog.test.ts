import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  findUncataloguedDependencies,
  findUnusedCatalogEntries,
  readCatalog,
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

describe("findUnusedCatalogEntries", () => {
  it("names entries no manifest takes from the catalog, peer ranges aside", () => {
    expect(
      findUnusedCatalogEntries(
        { hono: "4.13.14", jose: "6.2.13", react: "19.3.1", vite: "8.3.5" },
        [
          {
            path: "packages/core/package.json",
            json: { dependencies: { hono: "catalog:" } },
          },
          {
            path: "packages/create-robkit/templates/base/package.json",
            json: { devDependencies: { vite: "catalog:" } },
          },
          {
            path: "packages/hono/package.json",
            json: { peerDependencies: { react: "^19.0.0" } },
          },
        ],
      ),
    ).toEqual(["jose", "react"]);
  });
});

describe("the robkit workspace", () => {
  it("takes every external version from the catalog", async () => {
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const manifests = await readWorkspaceManifests(root);

    expect(manifests.map((m) => m.path)).toContain("package.json");
    expect(findUncataloguedDependencies(manifests)).toEqual([]);
  });

  // An install's catalog is a copy of this one, so a version only the
  // templates take is still in use.
  it("uses every catalog entry, counting the templates' manifests", async () => {
    const root = fileURLToPath(new URL("../../../", import.meta.url));

    expect(
      findUnusedCatalogEntries(
        await readCatalog(root),
        await readWorkspaceManifests(root),
      ),
    ).toEqual([]);
  });
});
