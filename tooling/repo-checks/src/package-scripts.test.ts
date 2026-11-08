import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  readWorkspaceScripts,
  scriptProblems,
  type Exceptions,
} from "./package-scripts.ts";

const all = {
  build: "tsc -p tsconfig.build.json",
  lint: "eslint .",
  typecheck: "tsc",
  test: "vitest run --coverage",
  "test:unit": "vitest run",
};

const without = (...names: string[]) =>
  Object.fromEntries(
    Object.entries(all).filter(([name]) => !names.includes(name)),
  );

describe("scriptProblems", () => {
  it("accepts a published package with every script", () => {
    expect(
      scriptProblems([{ name: "@robkit/x", private: false, scripts: all }], {}),
    ).toEqual([]);
  });

  it("names each script a package lacks", () => {
    expect(
      scriptProblems(
        [
          {
            name: "@robkit/x",
            private: false,
            scripts: without("build", "test:unit"),
          },
        ],
        {},
      ),
    ).toEqual([
      "@robkit/x has no build script. A published package builds to dist.",
      "@robkit/x has no test:unit script. Run the tests that need no Docker with it, so pnpm check runs them, or list the package in package-scripts.ts's exceptions with why it can't.",
    ]);
  });

  it("asks a private package for no build", () => {
    expect(
      scriptProblems(
        [{ name: "@internal/x", private: true, scripts: without("build") }],
        {},
      ),
    ).toEqual([]);
  });

  it("lets an exception leave out the scripts it names", () => {
    const exceptions: Exceptions = {
      "@internal/x": { without: ["test:unit"], reason: "Docker" },
    };

    expect(
      scriptProblems(
        [
          {
            name: "@internal/x",
            private: true,
            scripts: without("build", "test:unit"),
          },
        ],
        exceptions,
      ),
    ).toEqual([]);
  });

  it("names an exception the package no longer needs", () => {
    const exceptions: Exceptions = {
      "@internal/x": { without: ["test:unit"], reason: "Docker" },
      "@internal/gone": { without: ["typecheck"], reason: "JavaScript" },
    };

    expect(
      scriptProblems(
        [{ name: "@internal/x", private: true, scripts: without("build") }],
        exceptions,
      ),
    ).toEqual([
      "@internal/x has a test:unit script, so package-scripts.ts's exceptions needn't excuse it.",
      "package-scripts.ts excuses @internal/gone, which has no tests.",
    ]);
  });
});

describe("the robkit workspace", () => {
  it("gives every package with tests the scripts the gates run", async () => {
    const packages = await readWorkspaceScripts(
      join(import.meta.dirname, "../../.."),
    );

    expect(packages.map((p) => p.name)).toEqual(
      expect.arrayContaining(["@robkit/core", "@internal/go"]),
    );
    expect(scriptProblems(packages)).toEqual([]);
  });
});
