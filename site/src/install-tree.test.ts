import { stat } from "node:fs/promises";
import { join } from "node:path";
import { readyStacks } from "create-robkit";
import { describe, expect, it } from "vitest";
import { installTree, templatesFor, treePaths } from "./install-tree.ts";
import { repoRoot } from "./repo.ts";
import { templatesRoot } from "./templates.ts";

describe("treePaths", () => {
  it("names each entry from the install's root, folders first", () => {
    expect(
      treePaths([
        {
          name: "apps/",
          about: "",
          children: [{ name: "hub/", about: "" }],
        },
        { name: "README.md", about: "" },
      ]),
    ).toEqual(["apps/", "apps/hub/", "README.md"]);
  });
});

describe("templatesFor", () => {
  it("finds an install's file in the base template", () => {
    expect(templatesFor("apps/hub/")).toEqual(["base/apps/hub"]);
    expect(templatesFor("docs/deploy.md")).toEqual(["base/docs/deploy.md"]);
  });

  it("finds the example app in every stack's template", () => {
    expect(templatesFor("apps/example/")).toEqual(
      readyStacks.map((stack) => `stacks/${stack}`),
    );
  });
});

describe("the install tree", () => {
  it("names only what npm create robkit writes", async () => {
    const missing: string[] = [];
    for (const path of treePaths(installTree)) {
      for (const template of templatesFor(path)) {
        await stat(join(repoRoot, templatesRoot, template)).catch(() => {
          // A path that isn't there is what this test looks for, so the
          // error says nothing more than its name does.
          missing.push(`${path} (${template})`);
        });
      }
    }

    expect(treePaths(installTree)).toEqual([
      "apps/",
      "apps/core/",
      "apps/hub/",
      "apps/admin/",
      "apps/example/",
      "packages/",
      "packages/ui/",
      "packages/theme/",
      "packages/core-client/",
      "docs/deploy.md",
      "AGENTS.md",
      "README.md",
    ]);
    expect(missing).toEqual([]);
  });
});
