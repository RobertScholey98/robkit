// A second version of robkit's packages, for the upgrade test: every
// tarball the checkout packed, repacked at a newer version. Each package
// pins robkit's others at the exact version, and create-robkit carries
// every package's version, so all of those move together, or an install
// of the newer version wouldn't resolve.
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isRecord } from "@robkit/input";
import { run } from "./registry.ts";

/** `version` with its patch one higher, such as `0.1.1` for `0.1.0`. */
export function nextPatch(version: string): string {
  const [major, minor, patch] = version.split(".").map(Number);
  if (major === undefined || minor === undefined || patch === undefined) {
    throw new Error(`${version} isn't a version such as 0.1.0.`);
  }
  return `${String(major)}.${String(minor)}.${String(patch + 1)}`;
}

const isRobkit = (name: string) =>
  name.startsWith("@robkit/") || name === "create-robkit";

/** Reads a JSON file robkit's own build wrote, as an object. */
async function readObject(path: string): Promise<Record<string, unknown>> {
  const json: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isRecord(json)) throw new Error(`${path} isn't a JSON object.`);
  return json;
}

const toJson = (json: unknown) => `${JSON.stringify(json, null, 2)}\n`;

/** What the newer version changes besides its version, to show it arrived. */
export interface NewerChanges {
  /** A line it adds to the end of the lint policy's `policy.js`. */
  lintPolicyLine: string;
  /** A line it adds to the end of the Go module's `go.mod`. */
  goModLine: string;
  /** create-robkit's `CHANGELOG.md` in the newer version. */
  changelog: string;
}

/**
 * Repacks each tarball in `dir`, at `from`, as `to` beside it. Every
 * robkit dependency at `from` moves to `to`, and create-robkit's
 * `dist/carried.json` names `to` for every package, and takes `changes`.
 */
export async function packNewer(
  dir: string,
  { from, to }: { from: string; to: string },
  changes: NewerChanges,
): Promise<void> {
  const tarballs = (await readdir(dir)).filter((file) =>
    file.endsWith(`-${from}.tgz`),
  );
  for (const file of tarballs) {
    const work = await mkdtemp(join(tmpdir(), "robkit-newer-"));
    const options = { cwd: work, env: process.env };
    await run("tar", ["-xzf", join(dir, file), "-C", work], options);
    const root = join(work, "package");
    const manifestPath = join(root, "package.json");
    const manifest = await readObject(manifestPath);
    manifest.version = to;
    for (const field of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
    ]) {
      const deps = manifest[field];
      if (!isRecord(deps)) continue;
      for (const [name, spec] of Object.entries(deps)) {
        if (isRobkit(name) && typeof spec === "string" && spec.endsWith(from)) {
          deps[name] = `${spec.slice(0, -from.length)}${to}`;
        }
      }
    }
    await writeFile(manifestPath, toJson(manifest));
    if (manifest.name === "create-robkit") {
      await carryNewer(root, to, changes);
    }
    await run(
      "tar",
      [
        "-czf",
        join(dir, file.replace(`-${from}.tgz`, `-${to}.tgz`)),
        "-C",
        work,
        "package",
      ],
      options,
    );
    await rm(work, { recursive: true, force: true });
  }
}

/** create-robkit's carried versions, lint policy, Go module and changelog. */
async function carryNewer(
  root: string,
  to: string,
  { lintPolicyLine, goModLine, changelog }: NewerChanges,
): Promise<void> {
  const carriedPath = join(root, "dist", "carried.json");
  const carried = await readObject(carriedPath);
  const { packages, lintPolicy, goModule } = carried;
  if (!isRecord(packages) || !isRecord(lintPolicy) || !isRecord(goModule)) {
    throw new Error(`${carriedPath} has no packages, lintPolicy or goModule.`);
  }
  for (const pkg of Object.values(packages)) {
    if (isRecord(pkg)) pkg.version = to;
  }
  lintPolicy["policy.js"] =
    `${String(lintPolicy["policy.js"])}${lintPolicyLine}\n`;
  goModule["go.mod"] = `${String(goModule["go.mod"])}${goModLine}\n`;
  await writeFile(carriedPath, toJson(carried));
  await writeFile(join(root, "CHANGELOG.md"), changelog);
}
