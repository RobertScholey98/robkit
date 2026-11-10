// What the release workflow's publish step decides and does: whether the
// pack job's tarballs are main's packages, which of them npm lacks, in what
// order, and how pnpm gets the token. That step holds the npm token, so this
// file and release-publish.ts import only node: modules and each other,
// never a package. release-publish.test.ts fails on one that does.

import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

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
 * The file `pnpm pack` writes for `name` at `version`: `@robkit/core` at
 * 0.1.0 packs to `robkit-core-0.1.0.tgz`.
 */
export function tarballName(name: string, version: string): string {
  return `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;
}

/** A tarball, and the name and version its own manifest gives. */
export interface Tarball {
  /** Its file name. */
  file: string;
  name: string;
  version: string;
}

/** The text of the file at `path` inside the gzipped tar `gz`, if any. */
function tarEntry(gz: Uint8Array, path: string): string | undefined {
  const tar = gunzipSync(gz);
  const field = (at: number, length: number) =>
    tar
      .subarray(at, at + length)
      .toString("utf8")
      .replace(/\0.*$/s, "");
  for (let at = 0; at + 512 <= tar.length;) {
    const name = field(at, 100);
    if (name === "") return undefined;
    const prefix = field(at + 345, 155);
    const size = Number.parseInt(field(at + 124, 12).trim() || "0", 8);
    const body = at + 512;
    if ((prefix === "" ? name : `${prefix}/${name}`) === path) {
      return tar.subarray(body, body + size).toString("utf8");
    }
    at = body + Math.ceil(size / 512) * 512;
  }
  return undefined;
}

/** The name and version in the manifest of the tarball at `path`. */
export async function readTarball(path: string): Promise<Tarball> {
  const file = basename(path);
  const text = tarEntry(await readFile(path), "package/package.json");
  const json = asObject(text === undefined ? undefined : JSON.parse(text));
  const { name, version } = json ?? {};
  if (typeof name !== "string" || typeof version !== "string") {
    throw new Error(
      `${file} has no package.json with a name and version, so nothing was published. Run the release again from main.`,
    );
  }
  return { file, name, version };
}

/**
 * Pairs each of main's packages with the tarball the pack job made of it,
 * and names each tarball that is missing, holds another package or version
 * than main has, or isn't one of main's packages. The release publishes
 * nothing while there is a problem.
 */
export function matchTarballs<P extends ReleasePackage>(
  packages: readonly P[],
  tarballs: readonly Tarball[],
): { matched: (P & { tarball: string })[]; problems: string[] } {
  const matched: (P & { tarball: string })[] = [];
  const problems: string[] = [];
  const expected = new Set<string>();
  for (const pkg of packages) {
    const file = tarballName(pkg.name, pkg.version);
    expected.add(file);
    const tarball = tarballs.find((each) => each.file === file);
    if (tarball === undefined) {
      problems.push(
        `The pack job's artifact has no ${file} for ${pkg.name}@${pkg.version}, which main holds. Run the release again from main.`,
      );
    } else if (tarball.name !== pkg.name || tarball.version !== pkg.version) {
      problems.push(
        `${file} holds ${tarball.name}@${tarball.version}, not ${pkg.name}@${pkg.version} as main has it, so nothing was published. Run the release again from main.`,
      );
    } else {
      matched.push({ ...pkg, tarball: file });
    }
  }
  for (const { file } of tarballs) {
    if (!expected.has(file)) {
      problems.push(
        `${file} isn't one of main's packages at its version, so nothing was published. Run the release again from main.`,
      );
    }
  }
  return { matched, problems };
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
