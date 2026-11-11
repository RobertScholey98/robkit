// Fails when a pull request changes a published package and none of its new
// changesets names that package. Every package is released at one version,
// so the name decides whose changelog gets the words, and `robkit upgrade`
// prints create-robkit's alone. CI runs it from the workspace root:
//   node tooling/repo-checks/src/check-changesets.ts <base-ref>
// It reads `changedFilePatterns` from .changeset/config.json and finds what
// changed the way `changeset status` does, with changesets' own code.
// create-robkit's build also copies files from outside its folder into an
// install, such as the Go module, so a change to one of those counts as a
// change to create-robkit. turbo.json names them, as that build's inputs.
import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";
import { getChangedPackagesSinceRef } from "@changesets/git";
import { readChangesets } from "@changesets/read";
import { isProblem, isRecord, parseJson, problem } from "@robkit/input";
import { readJsonFile } from "./manifest.ts";

const base = process.argv[2];
if (base === undefined) {
  console.error("Usage: check-changesets.ts <base-ref>");
  process.exit(2);
}

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const git = (...args: string[]) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const forkPoint = git("merge-base", base, "HEAD");

/**
 * The version a package had where the branch left its base, or undefined
 * for a package the base doesn't have.
 */
function versionAtBase(dir: string): string | undefined {
  const path = `${relative(root, dir).replaceAll("\\", "/")}/package.json`;
  try {
    const parsed = parseJson(git("show", `${forkPoint}:${path}`), path);
    if (isProblem(parsed) || !isRecord(parsed.json)) return undefined;
    const { version } = parsed.json;
    return typeof version === "string" ? version : undefined;
  } catch {
    // git show fails on a path the base doesn't have: a new package.
    return undefined;
  }
}

const configFile = join(root, ".changeset/config.json");
const changedFilePatterns = await readJsonFile(configFile, (json, source) => {
  const patterns = isRecord(json) ? json.changedFilePatterns : undefined;
  return isStringList(patterns)
    ? patterns
    : problem(`${source} must list changedFilePatterns.`);
});

/** The packages with a changed file that matches one of `patterns`. */
const changedIn = (patterns: readonly string[]) =>
  getChangedPackagesSinceRef({
    cwd: root,
    ref: base,
    changedFilePatterns: [...patterns],
  });

// What a release itself writes in a package is its package.json and its
// changelog, which no pattern names.
const beyondARelease = new Set(
  (
    await changedIn(
      changedFilePatterns.filter((pattern) => pattern !== "package.json"),
    )
  ).map(({ packageJson }) => packageJson.name),
);

const changed = (await changedIn(changedFilePatterns))
  .filter(({ packageJson }) => packageJson.private !== true)
  // The version pull request bumps each version and spends the changesets,
  // so a package released in this branch needs no new one for that. A
  // change to its source or templates in the same branch still does.
  .filter(({ packageJson, dir }) => {
    const was = versionAtBase(dir);
    return (
      was === undefined ||
      was === packageJson.version ||
      beyondARelease.has(packageJson.name)
    );
  })
  .map(({ packageJson }) => packageJson.name);

// create-robkit's build carries files from outside its folder into every
// install: the catalog, pnpm's version, the lint policy and the Go module.
// They belong to no published package, so a change to one is a change to
// create-robkit, whose changelog `robkit upgrade` prints. turbo.json names
// them as that build's inputs, and this reads them from there.
const carrier = "create-robkit";
const fromRoot = "$TURBO_ROOT$/";

/** One of turbo's globs as a pattern: `**` crosses folders, `*` stays in one. */
function globShape(glob: string): RegExp {
  const literal = (text: string) => text.replace(/[.+^${}()|[\]\\?]/g, "\\$&");
  const shape = glob
    .split("**")
    .map((part) => part.split("*").map(literal).join("[^/]*"))
    .join(".*");
  return new RegExp(`^${shape}$`);
}

const carried = (
  await readJsonFile(join(root, "turbo.json"), (json, source) => {
    const tasks = isRecord(json) ? json.tasks : undefined;
    const build = isRecord(tasks) ? tasks[`${carrier}#build`] : undefined;
    const inputs = isRecord(build) ? build.inputs : undefined;
    return isStringList(inputs)
      ? inputs
      : problem(`${source} must list the inputs of ${carrier}#build.`);
  })
)
  .filter((input) => input.startsWith(fromRoot))
  .map((input) => input.slice(fromRoot.length))
  // Each published package answers for its own package.json, above.
  .filter((glob) => !glob.startsWith("packages/"))
  .map(globShape);
const carriedChanged = git("diff", "--name-only", forkPoint)
  .split("\n")
  .some((file) => carried.some((shape) => shape.test(file)));
// The version pull request changes none of them, so nothing excuses this.
if (carriedChanged && !changed.includes(carrier)) changed.push(carrier);

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
