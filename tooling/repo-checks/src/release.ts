// What a release needs to be right: one version for every package, no
// major change before 1.0.0, and what the dry run checks in the tarballs.
// CONTRIBUTING.md's "Releasing" walks through a release.

import { isProblem, isRecord, parseJson } from "@robkit/input";
import { parse } from "yaml";
import type { Packed } from "./published.ts";

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

/**
 * Each package's version as create-robkit's `dist/carried.json` names it,
 * or undefined for text that isn't what its build writes.
 */
function carriedVersions(
  text: string,
): Map<string, string | undefined> | undefined {
  const parsed = parseJson(text, "dist/carried.json");
  if (isProblem(parsed) || !isRecord(parsed.json)) return undefined;
  const { packages } = parsed.json;
  if (!isRecord(packages)) return undefined;
  return new Map(
    Object.entries(packages).map(([name, pkg]) => [
      name,
      isRecord(pkg) && typeof pkg.version === "string"
        ? pkg.version
        : undefined,
    ]),
  );
}

/**
 * What a release would get wrong in the packed packages, on top of
 * `packProblems` in `published.ts`: packages at more than one version, a
 * `workspace:` or `catalog:` range that pnpm should have turned into a version, and a
 * version create-robkit carries that isn't the one packed.
 */
export function dryRunProblems(
  packed: readonly Pick<
    Packed,
    "name" | "version" | "specifiers" | "carried"
  >[],
): string[] {
  const problems: string[] = [];
  if (new Set(packed.map(({ version }) => version)).size > 1) {
    const each = packed.map(({ name, version }) => `${name}@${version}`);
    problems.push(
      `The packages aren't at one version: ${each.join(", ")}. Every package is in .changeset/config.json's fixed group, so set them back to one version with pnpm release:version.`,
    );
  }
  for (const { name, specifiers } of packed) {
    for (const { field, name: dep, range } of specifiers) {
      if (!/^(workspace|catalog):/.test(range)) continue;
      problems.push(
        `${name}'s packed package.json still says ${range} for ${dep} in ${field}. Pack and publish with pnpm, which turns workspace: and catalog: into versions.`,
      );
    }
  }
  const createRobkit = packed.find(({ name }) => name === "create-robkit");
  if (createRobkit === undefined) return problems;
  const carried =
    createRobkit.carried === undefined
      ? undefined
      : carriedVersions(createRobkit.carried);
  if (carried === undefined) {
    problems.push(
      "create-robkit's tarball lacks dist/carried.json, so an install made from it reads no versions. Build create-robkit before packing it.",
    );
    return problems;
  }
  const rebuild =
    "Build create-robkit again: its build writes dist/carried.json.";
  for (const { name, version } of packed) {
    const carriedVersion = carried.get(name);
    if (carriedVersion === undefined) {
      problems.push(
        `create-robkit doesn't carry ${name}, so an install can't name its version. ${rebuild}`,
      );
    } else if (carriedVersion !== version) {
      problems.push(
        `create-robkit carries ${name}@${carriedVersion}, but ${name} packs at ${version}. ${rebuild}`,
      );
    }
  }
  const packedNames = new Set(packed.map(({ name }) => name));
  for (const name of carried.keys()) {
    if (!packedNames.has(name)) {
      problems.push(`create-robkit carries ${name}, which no package packs.`);
    }
  }
  return problems;
}
