// What `pnpm new:package <name>` writes: a published package with the
// scripts, configs, README sections and API report the repo checks want,
// its entry in the package graph, and an edge from the repo checks, so
// turbo builds it before they read its dist.

import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { format, resolveConfig } from "prettier";
import ts from "typescript";
import { isRecord } from "@robkit/input";
import { apiReport } from "./api-report.ts";

const graphFile = "tooling/eslint/package-graph.js";
const repoChecksManifest = "tooling/repo-checks/package.json";

/** A lowercase slug: letters, digits and single dashes, starting with a letter. */
const packageName = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** Why `name` can't name a new package under `root`, if it can't. */
export async function newPackageProblems(
  root: string,
  name: string,
): Promise<string[]> {
  if (!packageName.test(name)) {
    return [
      `"${name}" can't name a package. Give a lowercase name of letters, digits and dashes, such as pnpm new:package feature-flags.`,
    ];
  }
  const folder = `packages/${name}`;
  const taken = await stat(join(root, folder)).then(
    () => true,
    // Nothing there, which is what a new package needs.
    () => false,
  );
  return taken ? [`${folder} already exists. Choose another name.`] : [];
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** The package's own files, by their path in its folder. */
function packageFiles(name: string): Record<string, string> {
  const full = `@robkit/${name}`;
  return {
    "package.json": json({
      name: full,
      version: "0.0.0",
      license: "MIT",
      repository: {
        type: "git",
        url: "git+https://github.com/RobertScholey98/robkit.git",
        directory: `packages/${name}`,
      },
      type: "module",
      exports: { ".": "./src/index.ts" },
      publishConfig: {
        exports: {
          ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
        },
      },
      // robkit's own tests stay out of the tarball.
      files: [
        "dist",
        "src",
        "!src/**/*.test.ts",
        "!src/**/*.test-d.ts",
        "!src/test",
      ],
      engines: { node: ">=24" },
      scripts: {
        build: "tsc -p tsconfig.build.json",
        lint: "eslint .",
        typecheck: "tsc",
        test: "vitest run --coverage",
        "test:unit": "vitest run --coverage",
      },
      devDependencies: {
        "@internal/eslint-config": "workspace:*",
        "@internal/tsconfig": "workspace:*",
        "@types/node": "catalog:",
        "@vitest/coverage-v8": "catalog:",
        eslint: "catalog:",
        typescript: "catalog:",
        vitest: "catalog:",
      },
    }),
    "tsconfig.json": json({
      extends: "@internal/tsconfig/base.json",
      compilerOptions: { types: ["node"] },
      include: ["src", "*.js", "*.ts"],
    }),
    "tsconfig.build.json": json({
      extends: "./tsconfig.json",
      compilerOptions: {
        noEmit: false,
        rootDir: "src",
        outDir: "dist",
        declaration: true,
        rewriteRelativeImportExtensions: true,
      },
      include: ["src"],
      exclude: ["src/**/*.test.ts", "src/**/*.test-d.ts", "src/test"],
    }),
    "eslint.config.js": [
      'import { config } from "@internal/eslint-config";',
      "",
      "export default config(import.meta.dirname);",
      "",
    ].join("\n"),
    "vitest.config.ts": [
      'import { defineConfig } from "vitest/config";',
      "",
      "export default defineConfig({",
      "  test: {",
      "    // It starts with no tests. Thresholds of 100 make its first code",
      "    // bring tests with it.",
      "    passWithNoTests: true,",
      "    coverage: {",
      '      include: ["src/**"],',
      "      // Type tests run in the typechecker, and src/test holds test helpers.",
      '      exclude: ["src/**/*.test-d.ts", "src/test/**"],',
      "      // Today's coverage, rounded down. Raise them as it rises; CI fails a",
      "      // pull request that lowers one.",
      "      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },",
      "    },",
      "  },",
      "});",
      "",
    ].join("\n"),
    "src/index.ts": "export {};\n",
    "README.md": [
      `# ${full}`,
      "",
      "Say what the package is for, and who uses it.",
      "",
      "## Example",
      "",
      "Show it in use, in a `ts` fence. The doc examples check compiles it.",
      "",
      "## Exports",
      "",
      "| Export | What it is |",
      "| ------ | ---------- |",
      "",
      "## What it must never do",
      "",
      "Say what it must not import or do. Each rule goes in AGENTS.md's layer rule with the lint rule that enforces it.",
      "",
    ].join("\n"),
  };
}

/** The API report for a package that exports nothing yet. */
async function emptyApiReport(manifest: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "robkit-new-package-"));
  try {
    await mkdir(join(dir, "dist"));
    await writeFile(join(dir, "package.json"), manifest);
    await writeFile(join(dir, "dist/index.d.ts"), "export {};\n");
    return await apiReport(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function propertyNamed(
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.PropertyAssignment | undefined {
  return object.properties.find(
    (p): p is ts.PropertyAssignment =>
      ts.isPropertyAssignment(p) &&
      (ts.isStringLiteral(p.name) || ts.isIdentifier(p.name)) &&
      p.name.text === name,
  );
}

/**
 * `package-graph.js` with an entry for `full`, which depends on nothing yet,
 * and with the repo checks taking it as a dev dependency.
 */
export function addToGraph(text: string, full: string): string {
  const source = ts.createSourceFile(
    graphFile,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  let graph: ts.ObjectLiteralExpression | undefined;
  source.forEachChild(function find(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "packageGraph" &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      graph = node.initializer;
    }
    node.forEachChild(find);
  });
  const checks = graph && propertyNamed(graph, "@internal/repo-checks");
  const checksEdges =
    checks && ts.isObjectLiteralExpression(checks.initializer)
      ? propertyNamed(checks.initializer, "devDependencies")
      : undefined;
  if (
    !graph ||
    !checksEdges ||
    !ts.isArrayLiteralExpression(checksEdges.initializer)
  ) {
    throw new Error(
      `${graphFile} has no packageGraph object with @internal/repo-checks's devDependencies, so ${full} can't be added to it.`,
    );
  }
  const edges = checksEdges.initializer;
  const names = edges.elements.map((element) => element.getText(source));
  const newEdges = `[${[...names, JSON.stringify(full)].sort().join(", ")}]`;
  // The new entry goes before the first private package, after the
  // published ones, with any comment above that package left above it.
  const firstPrivate = graph.properties.find((p) =>
    p.name?.getText(source).startsWith('"@internal/'),
  );
  const entry = `${JSON.stringify(full)}: { dependencies: [], devDependencies: [] },`;
  const edits = [
    { at: edges.getStart(source), end: edges.getEnd(), text: newEdges },
    firstPrivate
      ? {
          at: firstPrivate.getFullStart(),
          end: firstPrivate.getFullStart(),
          text: `\n${entry}`,
        }
      : {
          at: graph.getEnd() - 1,
          end: graph.getEnd() - 1,
          text: `${graph.properties.hasTrailingComma ? "" : ","}\n${entry}\n`,
        },
  ].sort((a, b) => b.at - a.at);
  return edits.reduce(
    (result, { at, end, text: insert }) =>
      result.slice(0, at) + insert + result.slice(end),
    text,
  );
}

/** The repo checks' manifest, taking `full` as a dev dependency. */
function addToRepoChecks(text: string, full: string): string {
  const manifest: unknown = JSON.parse(text);
  if (!isRecord(manifest) || !isRecord(manifest.devDependencies)) {
    throw new Error(
      `${repoChecksManifest} has no devDependencies object, so ${full} can't be added to it.`,
    );
  }
  const deps = { ...manifest.devDependencies, [full]: "workspace:*" };
  return json({
    ...manifest,
    devDependencies: Object.fromEntries(
      Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)),
    ),
  });
}

async function formatted(path: string, text: string): Promise<string> {
  return format(text, { ...(await resolveConfig(path)), filepath: path });
}

/**
 * Makes `packages/<name>` under `root` as `@robkit/<name>`, and adds it to
 * the package graph and the repo checks' dependencies. Every file it writes
 * is formatted as `pnpm format` would leave it.
 *
 * @returns each file it wrote or changed, from `root`
 */
export async function newPackage(
  root: string,
  name: string,
): Promise<string[]> {
  const full = `@robkit/${name}`;
  const files = packageFiles(name);
  files["api-report.md"] = await emptyApiReport(files["package.json"] ?? "");
  const written: Record<string, string> = Object.fromEntries(
    Object.entries(files).map(([path, text]) => [
      `packages/${name}/${path}`,
      text,
    ]),
  );
  written[graphFile] = addToGraph(
    await readFile(join(root, graphFile), "utf8"),
    full,
  );
  written[repoChecksManifest] = addToRepoChecks(
    await readFile(join(root, repoChecksManifest), "utf8"),
    full,
  );
  for (const [path, text] of Object.entries(written)) {
    const target = join(root, path);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, await formatted(target, text));
  }
  return Object.keys(written);
}
