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
    devDependencies: ["@internal/test-session", "@robkit/input"],
  },
  "@robkit/express": {
    dependencies: ["@robkit/guard", "@robkit/session"],
    devDependencies: ["@internal/test-session", "@robkit/input"],
  },
  "@robkit/next": {
    dependencies: ["@robkit/guard", "@robkit/input", "@robkit/session"],
    devDependencies: ["@internal/test-session"],
  },
  "@robkit/start": {
    dependencies: ["@robkit/guard", "@robkit/session"],
    devDependencies: ["@internal/test-session", "@robkit/input"],
  },
  "@robkit/react": {
    dependencies: ["@robkit/session"],
    devDependencies: [],
  },
  // Gives each app its schema and role. Below core and the dev runner, so
  // neither needs the other for it.
  "@robkit/provision": {
    dependencies: ["@robkit/input"],
    devDependencies: ["@internal/test-postgres", "@internal/test-session"],
  },
  // Gives an app its Drizzle database and migrates its schema. Its tests
  // migrate a schema the provision step made.
  "@robkit/drizzle": {
    dependencies: ["@robkit/input"],
    devDependencies: [
      "@internal/test-postgres",
      "@internal/test-session",
      "@robkit/provision",
    ],
  },
  // robkit-core runs the provision step before it migrates and serves, and
  // migrates through the apps' migrator.
  "@robkit/core": {
    dependencies: [
      "@robkit/drizzle",
      "@robkit/guard",
      "@robkit/input",
      "@robkit/provision",
      "@robkit/session",
    ],
    devDependencies: ["@internal/test-postgres", "@internal/test-session"],
  },
  "@robkit/dev": {
    dependencies: ["@robkit/input", "@robkit/provision"],
    devDependencies: ["@internal/test-postgres", "@internal/test-session"],
  },
  // `robkit check` refuses an app that reads the session cookie by its name,
  // which it takes from session. A deploy derives each app's database
  // password as the provision step does.
  "create-robkit": {
    dependencies: [
      "@robkit/dev",
      "@robkit/input",
      "@robkit/provision",
      "@robkit/session",
    ],
    devDependencies: ["@internal/test-session"],
  },
  "@internal/eslint-config": { dependencies: [], devDependencies: [] },
  "@internal/tsconfig": { dependencies: [], devDependencies: [] },
  "@internal/test-postgres": { dependencies: [], devDependencies: [] },
  "@internal/test-session": {
    dependencies: [],
    devDependencies: ["@robkit/guard", "@robkit/input"],
  },
  // Packs and checks every published package.
  "@internal/repo-checks": {
    dependencies: [],
    devDependencies: [
      "@robkit/core",
      "@robkit/dev",
      "@robkit/drizzle",
      "@robkit/express",
      "@robkit/guard",
      "@robkit/hono",
      "@robkit/input",
      "@robkit/next",
      "@robkit/provision",
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
      "@internal/test-session",
      "@robkit/dev",
      "@robkit/input",
      "@robkit/provision",
      "create-robkit",
    ],
  },
};
