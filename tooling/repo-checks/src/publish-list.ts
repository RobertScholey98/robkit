// What the release workflow's publish step decides and does: which
// packages npm lacks, in what order, and how pnpm gets the token. That step
// holds the npm token, so this file and release-publish.ts import only
// node: modules and each other, never a package. release-publish.test.ts
// fails on one that does.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packagesDir = fileURLToPath(
  new URL("../../../packages", import.meta.url),
);

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

/** Whether `value` is a JSON object. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `value` as an object, or undefined. */
const asObject = (value: unknown) => (isObject(value) ? value : undefined);

/**
 * Each package robkit publishes, as main has it: each folder under
 * `packages/` whose `package.json` isn't private.
 */
export async function releasePackages(): Promise<
  (ReleasePackage & { dir: string })[]
> {
  const read = [];
  for (const entry of await readdir(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(packagesDir, entry.name);
    const file = join(dir, "package.json");
    const json = asObject(JSON.parse(await readFile(file, "utf8")));
    if (json?.private === true) continue;
    const { name, version } = json ?? {};
    if (typeof name !== "string" || typeof version !== "string") {
      throw new Error(`${file} has no name or version to publish.`);
    }
    const dependencies = Object.keys(asObject(json?.dependencies) ?? {});
    read.push({ dir, name, version, dependencies });
  }
  const names = new Set(read.map(({ name }) => name));
  return read.map(({ dir, name, version, dependencies }) => ({
    name,
    version,
    dir,
    dependsOn: dependencies.filter((dep) => names.has(dep)),
  }));
}

/** Where robkit publishes. */
export const npmRegistry = "https://registry.npmjs.org";

/**
 * Each version `registry` has of the package `name`, or none for a package
 * it has never seen. Any other answer throws, so a release never publishes
 * without knowing what is there.
 */
export async function registryVersions(
  name: string,
  registry: string = npmRegistry,
): Promise<string[]> {
  const response = await fetch(`${registry}/${name.replace("/", "%2f")}`, {
    // npm's short form of a package's document, which lists its versions.
    headers: { accept: "application/vnd.npm.install-v1+json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) return [];
  if (!response.ok) {
    throw new Error(
      `${registry} answered ${String(response.status)} for ${name}, so the release can't tell what is published. Run the release again once npm answers.`,
    );
  }
  const json: unknown = await response.json();
  const versions = asObject(asObject(json)?.versions);
  if (versions === undefined) {
    throw new Error(
      `${registry}'s answer for ${name} lists no versions, so the release can't tell what is published.`,
    );
  }
  return Object.keys(versions);
}

/**
 * How the release runs `pnpm publish` in a package's folder. pnpm, not npm,
 * since only pnpm swaps in `publishConfig`'s `exports` and `bin` and turns
 * `workspace:` and `catalog:` into versions as it packs. Provenance links
 * each version to the workflow run that published it. No package script
 * runs while the token is there.
 */
export const publishArgs = [
  "publish",
  "--provenance",
  "--access",
  "public",
  "--no-git-checks",
  "--ignore-scripts",
] as const;

/**
 * The environment that gives pnpm `token` for `registry` and nowhere else.
 * pnpm 11 reads `pnpm_config__auth`, keyed by registry, from the
 * environment only, never from the repo's own config.
 */
export function authEnv(
  token: string,
  registry: string = npmRegistry,
): { pnpm_config__auth: string } {
  return {
    pnpm_config__auth: JSON.stringify({
      [registry]: { "@": { authToken: token } },
    }),
  };
}
