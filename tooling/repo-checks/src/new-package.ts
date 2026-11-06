// Makes a published package that passes the repo checks. Run it from the
// repo's root, as pnpm does:
//   pnpm new:package <name>
import { newPackage, newPackageProblems } from "./package-scaffold.ts";

const root = process.cwd();
const name = process.argv[2] ?? "";
const problems = await newPackageProblems(root, name);
for (const problem of problems) console.error(problem);
if (problems.length > 0) process.exit(1);
await newPackage(root, name);
console.log(
  `Made @robkit/${name} in packages/${name}, and added it to tooling/eslint/package-graph.js and tooling/repo-checks/package.json.`,
);
console.log(
  "Next: run pnpm install, then give it code, tests and a README. After you add exports, run pnpm --filter @internal/repo-checks api:update.",
);
