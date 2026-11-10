// What a release needs to be right: one version for every package, no
// major change before 1.0.0, and what the release scripts decide.
// CONTRIBUTING.md's "Releasing" walks through a release.

import { isRecord } from "@robkit/input";

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
