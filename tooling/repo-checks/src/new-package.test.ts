// `pnpm new:package <name>` in a copy of the repo, then the repo checks on
// what it made. The checks that read built or packed packages (the API
// report against tsc's output, publint) can't run without an install, so
// the API report is checked against declarations TypeScript emits here.
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { check as isFormatted } from "prettier";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PackageGraph } from "@internal/eslint-config/package-graph";
import { apiReport } from "./api-report.ts";
import {
  findUncataloguedDependencies,
  readWorkspaceManifests,
} from "./catalog.ts";
import { readWorkspaceCoverage } from "./coverage-thresholds.ts";
import { deadlineProblems, readOutboundCode } from "./deadlines.ts";
import { examplesIn } from "./doc-examples.ts";
import {
  avoidWords,
  exceptions as glossaryExceptions,
  glossaryProblems,
  readScannedFiles,
} from "./glossary.ts";
import {
  cycles,
  importProblems,
  importsUnder,
  manifestProblems,
  readWorkspace,
} from "./graph-check.ts";
import { newPackage, newPackageProblems } from "./package-scaffold.ts";
import { readWorkspaceScripts, scriptProblems } from "./package-scripts.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const script = join(import.meta.dirname, "new-package.ts");
const skipped = new Set([".git", "node_modules", "dist", ".turbo", "coverage"]);

let copy: string;

beforeAll(async () => {
  copy = await mkdtemp(join(tmpdir(), "robkit-new-package-"));
  await cp(root, copy, {
    recursive: true,
    filter: (source) => !skipped.has(source.split(/[\\/]/).at(-1) ?? ""),
  });
}, 60_000);

afterAll(async () => {
  await rm(copy, { recursive: true, force: true });
});

const run = (...args: string[]) => {
  const { status, stdout, stderr } = spawnSync(
    process.execPath,
    [script, ...args],
    { cwd: copy, encoding: "utf8" },
  );
  return { status, output: stdout + stderr };
};

/** The copy's package graph, as the new packages left it. */
async function graphOf(dir: string): Promise<PackageGraph> {
  const url = pathToFileURL(join(dir, "tooling/eslint/package-graph.js"));
  const module = (await import(url.href)) as { packageGraph: PackageGraph };
  return module.packageGraph;
}

describe("newPackage, and new-package.ts", () => {
  const made = ["widgets", "gadgets"];

  beforeAll(async () => {
    // One in this process, so coverage sees it; one the way pnpm runs it.
    await newPackage(copy, "widgets");
    expect(run("gadgets")).toEqual({
      status: 0,
      output: [
        "Made @robkit/gadgets in packages/gadgets, and added it to tooling/eslint/package-graph.js and tooling/repo-checks/package.json.",
        "Next: run pnpm install, then give it code, tests and a README. After you add exports, run pnpm --filter @internal/repo-checks api:update.",
        "",
      ].join("\n"),
    });
    // Two packages made and formatted, one in a new process. On a busy CI
    // runner that passed 30 seconds.
  }, 120_000);

  it("writes the files a published package needs", async () => {
    const manifest: unknown = JSON.parse(
      await readFile(join(copy, "packages/widgets/package.json"), "utf8"),
    );

    expect(manifest).toMatchObject({
      name: "@robkit/widgets",
      type: "module",
      exports: { ".": "./src/index.ts" },
      // robkit's own tests stay out of the tarball.
      files: [
        "dist",
        "src",
        "!src/**/*.test.ts",
        "!src/**/*.test-d.ts",
        "!src/test",
      ],
    });
    for (const file of [
      "README.md",
      "api-report.md",
      "eslint.config.js",
      "src/index.ts",
      "tsconfig.build.json",
      "tsconfig.json",
      "vitest.config.ts",
    ]) {
      await expect(
        readFile(join(copy, "packages/widgets", file), "utf8"),
      ).resolves.not.toBe("");
    }
  });

  it("gives each the scripts the gates run, and coverage thresholds", async () => {
    expect(scriptProblems(await readWorkspaceScripts(copy))).toEqual([]);
    const coverage = await readWorkspaceCoverage(copy);
    for (const name of made) {
      expect(coverage.find((p) => p.name === `@robkit/${name}`)).toEqual({
        name: `@robkit/${name}`,
        coverage: true,
        thresholds: {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      });
    }
  });

  it("takes every version from the catalog", async () => {
    expect(
      findUncataloguedDependencies(await readWorkspaceManifests(copy)),
    ).toEqual([]);
  });

  it("adds each to the package graph, and to what the repo checks build", async () => {
    const graph = await graphOf(copy);
    const packages = await readWorkspace(copy);

    expect(graph["@robkit/widgets"]).toEqual({
      dependencies: [],
      devDependencies: [],
    });
    expect(graph["@internal/repo-checks"]?.devDependencies).toEqual(
      expect.arrayContaining(["@robkit/gadgets", "@robkit/widgets"]),
    );
    expect(manifestProblems(graph, packages)).toEqual([]);
    expect(cycles(graph)).toEqual([]);
    for (const pkg of packages.filter(({ name }) =>
      made.some((m) => name === `@robkit/${m}`),
    )) {
      const imports = await importsUnder(copy, pkg.folder);
      expect(importProblems(graph, pkg, packages, imports)).toEqual([]);
    }
  });

  it("writes an API report that matches the package's built declarations", async () => {
    for (const name of made) {
      const dir = join(copy, "packages", name);
      const index = await readFile(join(dir, "src/index.ts"), "utf8");
      await mkdir(join(dir, "dist"), { recursive: true });
      await writeFile(
        join(dir, "dist/index.d.ts"),
        ts.transpileDeclaration(index, {}).outputText,
      );

      expect(await apiReport(dir)).toBe(
        await readFile(join(dir, "api-report.md"), "utf8"),
      );
    }
  });

  it("passes the glossary, deadline and doc example checks", async () => {
    const words = avoidWords(await readFile(join(copy, "GLOSSARY.md"), "utf8"));
    const scanned = (await readScannedFiles(copy)).filter(({ file }) =>
      made.some((name) => file.startsWith(`packages/${name}/`)),
    );

    expect(scanned.map(({ file }) => file)).toContain(
      "packages/widgets/README.md",
    );
    expect(glossaryProblems(scanned, words, glossaryExceptions)).toEqual([]);
    expect(deadlineProblems(await readOutboundCode(copy))).toEqual([]);
    for (const { file, text } of scanned) {
      expect(examplesIn(file, text)).toEqual([]);
    }
  });

  it("leaves every file it wrote or changed formatted", async () => {
    const files = [
      "tooling/eslint/package-graph.js",
      "tooling/repo-checks/package.json",
      ...made.flatMap((name) =>
        [
          "README.md",
          "api-report.md",
          "eslint.config.js",
          "package.json",
          "src/index.ts",
          "tsconfig.build.json",
          "tsconfig.json",
          "vitest.config.ts",
        ].map((file) => `packages/${name}/${file}`),
      ),
    ];
    const unformatted: string[] = [];
    for (const file of files) {
      const text = await readFile(join(copy, file), "utf8");
      if (!(await isFormatted(text, { filepath: join(copy, file) }))) {
        unformatted.push(file);
      }
    }

    expect(unformatted).toEqual([]);
  });
});

describe("newPackageProblems", () => {
  it("refuses a name that isn't a lowercase slug", async () => {
    for (const name of ["", "Widgets", "@robkit/widgets", "-x", "x-", "a b"]) {
      expect(await newPackageProblems(root, name)).toEqual([
        `"${name}" can't name a package. Give a lowercase name of letters, digits and dashes, such as pnpm new:package feature-flags.`,
      ]);
    }
  });

  it("refuses a package that exists", async () => {
    expect(await newPackageProblems(root, "guard")).toEqual([
      "packages/guard already exists. Choose another name.",
    ]);
  });

  it("accepts a new name", async () => {
    expect(await newPackageProblems(root, "feature-flags")).toEqual([]);
  });
});

describe("new-package.ts", () => {
  it("fails without a name, saying how to give one", () => {
    expect(run()).toEqual({
      status: 1,
      output:
        '"" can\'t name a package. Give a lowercase name of letters, digits and dashes, such as pnpm new:package feature-flags.\n',
    });
  });
});
