// What a release needs to be right: one version for every package, no
// major change before 1.0.0, and what the release scripts decide.
// CONTRIBUTING.md's "Releasing" walks through a release.

import { join } from "node:path";
import { isRecord } from "@robkit/input";
import { parse } from "yaml";
import { readJsonFile, readNamedManifest } from "./manifest.ts";
import { publishedPackages } from "./published.ts";

/**
 * Whether `name` is in a changesets group entry: the name itself, or a
 * scope's `@scope/*`. Changesets reads entries as globs, and these are the
 * two shapes robkit's group uses.
 */
function inGroup(entry: string, name: string): boolean {
  if (entry === name) return true;
  if (!entry.endsWith("/*")) return false;
  const scope = entry.slice(0, -1);
  return name.startsWith(scope) && !name.slice(scope.length).includes("/");
}

/**
 * What's wrong with `.changeset/config.json`'s fixed group: there must be
 * one, and it must hold every published package in `names`, so they are
 * always released at one version and an install's packages match.
 */
export function fixedGroupProblems(
  config: unknown,
  names: readonly string[],
): string[] {
  const fixed = isRecord(config) ? config.fixed : undefined;
  const group: unknown =
    Array.isArray(fixed) && fixed.length === 1 ? fixed[0] : undefined;
  if (!Array.isArray(group)) {
    return [
      '.changeset/config.json needs one fixed group holding every published package, such as "fixed": [["create-robkit", "@robkit/*"]], so they are always released at one version.',
    ];
  }
  const entries = group.filter((entry) => typeof entry === "string");
  return names
    .filter((name) => !entries.some((entry) => inGroup(entry, name)))
    .map(
      (name) =>
        `${name} isn't in .changeset/config.json's fixed group, so it could be released at a version the others aren't. Add it to the group, or match it with "@robkit/*".`,
    );
}

/** A changeset file: its id, the file's name without `.md`, and its text. */
export interface ChangesetFile {
  id: string;
  text: string;
}

/** Each package a changeset releases, with its bump: patch, minor or major. */
function releasesIn(text: string): [string, unknown][] {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  const releases: unknown = front === undefined ? undefined : parse(front);
  return isRecord(releases) ? Object.entries(releases) : [];
}

/**
 * Each major change in `changesets` while robkit's `version` is under
 * 1.0.0. With every package in one fixed group, one would release 1.0.0.
 */
export function majorChangesetProblems(
  changesets: readonly ChangesetFile[],
  version: string,
): string[] {
  if (!version.startsWith("0.")) return [];
  return changesets.flatMap(({ id, text }) =>
    releasesIn(text)
      .filter(([, bump]) => bump === "major")
      .map(
        ([name]) =>
          `.changeset/${id}.md makes a major change to ${name} while robkit is at ${version}, which would release 1.0.0. Make it minor: before 1.0.0, a minor release is the one that may break an install.`,
      ),
  );
}

/** A package as a release sees it. */
export interface ReleasePackage {
  name: string;
  version: string;
  /** The other published packages it lists under `dependencies`. */
  dependsOn: readonly string[];
}

/** What the release workflow publishes, and the tag it pushes after. */
export interface PublishPlan<P extends ReleasePackage> {
  /** Each package whose version npm lacks, each after what it depends on. */
  publish: P[];
  /** `v<version>` once npm has every package, so the tag comes last. */
  tag: string | undefined;
}

/**
 * What to publish, given the versions npm has of each package by name.
 * Only versions npm lacks are published, so a release that stopped halfway
 * runs again from where it stopped. The tag waits until npm has them all.
 */
export function publishPlan<P extends ReleasePackage>(
  packages: readonly P[],
  published: ReadonlyMap<string, readonly string[]>,
): PublishPlan<P> {
  const versions = new Set(packages.map(({ version }) => version));
  const [version] = versions;
  if (versions.size !== 1 || version === undefined) {
    const each = packages.map((pkg) => `${pkg.name}@${pkg.version}`);
    throw new Error(
      `The packages aren't at one version (${each.join(", ")}), so there is no one release to publish. Merge the version pull request that pnpm release:version opens.`,
    );
  }
  const waiting = packages.filter(
    (pkg) => !(published.get(pkg.name) ?? []).includes(pkg.version),
  );
  // Dependencies first, so an install never meets a package whose own
  // dependency isn't on npm yet.
  const publish: P[] = [];
  const left = new Set(waiting);
  while (left.size > 0) {
    const leftNames = new Set([...left].map(({ name }) => name));
    const ready = [...left].filter(({ dependsOn }) =>
      dependsOn.every((name) => !leftNames.has(name)),
    );
    // A cycle would leave nothing ready; publish the rest as they come.
    for (const pkg of ready.length > 0 ? ready : [...left]) {
      publish.push(pkg);
      left.delete(pkg);
    }
  }
  return { publish, tag: publish.length === 0 ? `v${version}` : undefined };
}

/** Each package robkit publishes, with its folder, as a release reads it. */
export async function releasePackages(): Promise<
  (ReleasePackage & { dir: string })[]
> {
  const manifests = await Promise.all(
    (await publishedPackages()).map(async (dir) => ({
      dir,
      ...(await readJsonFile(join(dir, "package.json"), readNamedManifest)),
    })),
  );
  const names = new Set(manifests.map(({ name }) => name));
  return manifests.map(({ dir, name, version, dependencies = {} }) => {
    if (version === undefined) {
      throw new Error(`${name}'s package.json has no version to publish.`);
    }
    return {
      name,
      version,
      dir,
      dependsOn: Object.keys(dependencies).filter((dep) => names.has(dep)),
    };
  });
}
