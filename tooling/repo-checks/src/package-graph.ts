/**
 * Which workspace package may depend on which: the only edges the repo
 * allows between them. `graph-check.test.ts` fails on a `package.json`
 * dependency or an import that isn't here, on an edge here that no
 * `package.json` has, and on a cycle. The `layer` ESLint rule must agree
 * with it, and a test checks that too.
 *
 * Edges to an external package aren't here. The catalog holds those.
 */
export interface Edges {
  /** What the package needs at runtime: its `dependencies`. */
  dependencies: readonly string[];
  /** What only its tests and tooling use: its `devDependencies`. */
  devDependencies: readonly string[];
}

export type PackageGraph = Readonly<Record<string, Edges>>;

/**
 * Packages any package may take as a dev dependency without an edge here:
 * the shared ESLint and TypeScript configs.
 */
export const toolchain: readonly string[] = [
  "@internal/eslint-config",
  "@internal/tsconfig",
];

export const packageGraph: PackageGraph = {
  // The pure guard: depends on nothing.
  "@robkit/guard": { dependencies: [], devDependencies: [] },
  "@robkit/session": {
    dependencies: ["@robkit/guard"],
    devDependencies: ["@internal/test-session"],
  },
  // Adapters take session and guard, never core.
  "@robkit/hono": {
    dependencies: ["@robkit/guard", "@robkit/session"],
    devDependencies: ["@internal/test-session"],
  },
  "@robkit/start": {
    dependencies: ["@robkit/guard", "@robkit/session"],
    devDependencies: ["@internal/test-session"],
  },
  "@robkit/react": {
    dependencies: ["@robkit/session"],
    devDependencies: [],
  },
  // Core's tests provision their database with the dev runner's step.
  "@robkit/core": {
    dependencies: ["@robkit/guard", "@robkit/session"],
    devDependencies: ["@internal/test-postgres", "@robkit/dev"],
  },
  "@robkit/dev": {
    dependencies: ["@robkit/session"],
    devDependencies: ["@internal/test-postgres"],
  },
  "create-robkit": {
    dependencies: ["@robkit/dev", "@robkit/session"],
    devDependencies: [],
  },
  "@internal/eslint-config": { dependencies: [], devDependencies: [] },
  "@internal/tsconfig": { dependencies: [], devDependencies: [] },
  "@internal/test-postgres": { dependencies: [], devDependencies: [] },
  "@internal/test-session": {
    dependencies: [],
    devDependencies: ["@robkit/guard"],
  },
  // Packs and checks every published package.
  "@internal/repo-checks": {
    dependencies: [],
    devDependencies: [
      "@robkit/core",
      "@robkit/dev",
      "@robkit/guard",
      "@robkit/hono",
      "@robkit/react",
      "@robkit/session",
      "@robkit/start",
      "create-robkit",
    ],
  },
  // The whole-stack test generates installs and drives them.
  "@internal/e2e": {
    dependencies: [],
    devDependencies: [
      "@internal/test-postgres",
      "@robkit/dev",
      "@robkit/session",
      "create-robkit",
    ],
  },
};
