// Fails when a pull request changes a published package and none of its new
// changesets names that package. Every package is released at one version,
// so the name decides whose changelog gets the words, and `robkit upgrade`
// prints create-robkit's alone. CI runs it from the workspace root:
//   node tooling/repo-checks/src/check-changesets.ts <base-ref>
// It reads `changedFilePatterns` from .changeset/config.json and finds what
// changed the way `changeset status` does, with changesets' own code.
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { getChangedPackagesSinceRef } from "@changesets/git";
import { readChangesets } from "@changesets/read";
import { isRecord, problem } from "@robkit/input";
import { readJsonFile } from "./manifest.ts";

const base = process.argv[2];
if (base === undefined) {
  console.error("Usage: check-changesets.ts <base-ref>");
  process.exit(2);
}

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const configFile = join(root, ".changeset/config.json");
const changedFilePatterns = await readJsonFile(configFile, (json, source) => {
  const patterns = isRecord(json) ? json.changedFilePatterns : undefined;
  return isStringList(patterns)
    ? patterns
    : problem(`${source} must list changedFilePatterns.`);
});

const changed = (
  await getChangedPackagesSinceRef({
    cwd: root,
    ref: base,
    changedFilePatterns,
  })
)
  .filter(({ packageJson }) => packageJson.private !== true)
  .map(({ packageJson }) => packageJson.name);
const named = new Set(
  (await readChangesets(root, base)).flatMap(({ releases }) =>
    releases.map(({ name }) => name),
  ),
);

const unnamed = changed.filter((name) => !named.has(name)).sort();
for (const name of unnamed) {
  console.error(
    `${name} changed, but no changeset in this branch names it. Run pnpm changeset, pick ${name} and say what changed for its changelog.`,
  );
}
if (unnamed.length > 0) process.exit(1);
