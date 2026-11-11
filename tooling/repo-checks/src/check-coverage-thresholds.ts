// Fails if a pull request lowers a package's coverage thresholds below what
// they are where it left its base. CI runs it from the workspace root:
//   node tooling/repo-checks/src/check-coverage-thresholds.ts <base-ref>
import { execFileSync } from "node:child_process";
import { existsSync, globSync, readFileSync } from "node:fs";
import { dirname, join, matchesGlob } from "node:path";
import {
  loweredThresholds,
  thresholdsIn,
  vitestConfigs,
} from "./coverage-thresholds.ts";

const baseRef = process.argv[2];
if (baseRef === undefined) {
  console.error("Usage: check-coverage-thresholds.ts <base-ref>");
  process.exit(2);
}

const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8" });

// The commit the branch started from. The base's tip may have moved on with
// changes of its own, which aren't this branch's to answer for.
const base = git("merge-base", baseRef, "HEAD").trim();

const root = git("rev-parse", "--show-toplevel").trim();
const before = git("ls-tree", "-r", "--name-only", base)
  .split("\n")
  .filter((path) => matchesGlob(path, vitestConfigs));
const after = globSync(vitestConfigs, { cwd: root }).map((path) =>
  path.replaceAll("\\", "/"),
);

const problems = [...new Set([...before, ...after])].sort().flatMap((path) => {
  // A package that's gone takes its thresholds with it.
  if (!existsSync(join(root, dirname(path), "package.json"))) return [];
  const was = before.includes(path)
    ? thresholdsIn(git("show", `${base}:${path}`))
    : undefined;
  const is = existsSync(join(root, path))
    ? thresholdsIn(readFileSync(join(root, path), "utf8"))
    : undefined;
  return loweredThresholds(path, was, is);
});

for (const problem of problems) console.error(problem);
if (problems.length > 0) process.exit(1);
