/**
 * Which workspace package may depend on which: the only edges the repo
 * allows between them. `graph-check.test.ts` in `tooling/repo-checks`
 * fails on a `package.json` dependency or an import that isn't here, on an
 * edge here that no `package.json` has, and on a cycle. The `layer` ESLint
 * rule builds its core rows from it, and the same test checks the rule's
 * other rows forbid no edge it allows.
 *
 * Edges to an external package aren't here. The catalog holds those.
 *
 * @typedef {object} Edges
 * @property {readonly string[]} dependencies what the package needs at
 *   runtime: its `dependencies`
 * @property {readonly string[]} devDependencies what only its tests and
 *   tooling use: its `devDependencies`
 */

/** @typedef {Readonly<Record<string, Edges>>} PackageGraph */

/**
 * Packages any package may take as a dev dependency without an edge here:
 * the shared ESLint and TypeScript configs.
 */
/** @type {readonly string[]} */
export const toolchain = ["@internal/eslint-config", "@internal/tsconfig"];

/** @type {PackageGraph} */
export const packageGraph = {
  // The readers for input from outside robkit: depend on nothing.
  "@robkit/input": { dependencies: [], devDependencies: [] },
  // The pure guard: depends only on the readers.
  "@robkit/guard": { dependencies: ["@robkit/input"], devDependencies: [] },
  "@robkit/session": {
    dependencies: ["@robkit/guard", "@robkit/input"],
    devDependencies: ["@internal/test-session"],
  },
  // Adapters take session and guard, never core.
  "@robkit/hono": {
    dependencies: ["@robkit/guard", "@robkit/session"],
    devDependencies: [
      "@internal/test-addresses",
      "@internal/test-session",
      "@robkit/input",
    ],
  },
  "@robkit/start": {
    dependencies: ["@robkit/guard", "@robkit/session"],
    devDependencies: [
      "@internal/test-addresses",
      "@internal/test-session",
      "@robkit/input",
    ],
  },
  "@robkit/react": {
    dependencies: ["@robkit/session"],
    devDependencies: [],
  },
  // Core's tests provision their database with the dev runner's step.
  "@robkit/core": {
    dependencies: ["@robkit/guard", "@robkit/input", "@robkit/session"],
    devDependencies: [
      "@internal/test-addresses",
      "@internal/test-postgres",
      "@internal/test-session",
      "@robkit/dev",
    ],
  },
  "@robkit/dev": {
    dependencies: ["@robkit/input", "@robkit/session"],
    devDependencies: ["@internal/test-addresses", "@internal/test-postgres"],
  },
  "create-robkit": {
    dependencies: ["@robkit/dev", "@robkit/input", "@robkit/session"],
    devDependencies: ["@internal/test-addresses"],
  },
  "@internal/eslint-config": { dependencies: [], devDependencies: [] },
  "@internal/tsconfig": { dependencies: [], devDependencies: [] },
  "@internal/test-postgres": { dependencies: [], devDependencies: [] },
  "@internal/test-session": {
    dependencies: [],
    devDependencies: ["@robkit/guard", "@robkit/input"],
  },
  // Builds session's checked addresses for the tests above session. Not in
  // test-session, which session's own tests use.
  "@internal/test-addresses": {
    dependencies: [],
    devDependencies: ["@robkit/input"],
  },
  // Packs and checks every published package.
  "@internal/repo-checks": {
    dependencies: [],
    devDependencies: [
      "@robkit/core",
      "@robkit/dev",
      "@robkit/guard",
      "@robkit/hono",
      "@robkit/input",
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
      "@internal/test-addresses",
      "@internal/test-postgres",
      "@robkit/dev",
      "@robkit/input",
      "@robkit/session",
      "create-robkit",
    ],
  },
};
