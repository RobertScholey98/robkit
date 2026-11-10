import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isRecord } from "@robkit/input";
import { parse } from "yaml";
import { jsonObject, stringsIn } from "./json.ts";

/**
 * What an install takes from the robkit checkout the generator runs from, so
 * each version has one home: robkit's own catalog and manifests.
 */
export interface RobkitRepo {
  /** The pnpm catalog: every external version robkit uses. */
  catalog: Map<string, string>;
  /** The root manifest's `packageManager`, such as `pnpm@11.28.9`. */
  packageManager: string;
  /** The `@robkit/*` packages and create-robkit, by name. */
  packages: Map<string, RobkitPackage>;
  /**
   * robkit's lint policy: `tooling/eslint/policy.js` and each file it
   * imports, by name, for an install to lint with too.
   */
  lintPolicy: Map<string, string>;
}

export interface RobkitPackage {
  version: string;
  dir: string;
  /** The robkit packages among its `dependencies`, which it runs on. */
  dependencies: string[];
}

/**
 * `names`, and each robkit package they run on, in turn, sorted. An
 * install's manifests name only some of them: `@robkit/provision` arrives
 * behind `@robkit/core`.
 */
export function withDependencies(
  names: Iterable<string>,
  packages: ReadonlyMap<string, RobkitPackage>,
): string[] {
  const found = new Set<string>();
  const queue = [...names];
  for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
    if (found.has(name)) continue;
    found.add(name);
    queue.push(...(packages.get(name)?.dependencies ?? []));
  }
  return [...found].sort();
}

const robkitRoot = fileURLToPath(new URL("../../../", import.meta.url));

/** A relative import of a JS file beside the importer, such as `"./x.js"`. */
const besideImport = /from "\.\/([\w.-]+\.js)"/g;

/**
 * `policy.js` in robkit's `tooling/eslint`, and each file it imports from
 * there, in turn, by name. Their packages come from the install's root.
 */
async function readLintPolicy(): Promise<Map<string, string>> {
  const dir = join(robkitRoot, "tooling", "eslint");
  const files = new Map<string, string>();
  const queue = ["policy.js"];
  for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
    if (files.has(name)) continue;
    // A Windows checkout may hold the files with CRLF endings.
    const text = (await readFile(join(dir, name), "utf8")).replaceAll(
      "\r\n",
      "\n",
    );
    files.set(name, text);
    for (const [, imported] of text.matchAll(besideImport)) {
      if (imported !== undefined) queue.push(imported);
    }
  }
  return files;
}

/** A manifest's string fields, such as its name and version. */
async function readManifest(dir: string): Promise<Record<string, string>> {
  return stringsIn(await readManifestJson(dir));
}

async function readManifestJson(dir: string) {
  const path = join(dir, "package.json");
  return jsonObject(await readFile(path, "utf8"), path);
}

/** Whether `name` is one of robkit's packages, which an install takes. */
function isRobkitPackage(name: string): boolean {
  // An install takes create-robkit for robkit add.
  return name.startsWith("@robkit/") || name === "create-robkit";
}

export async function readRobkitRepo(): Promise<RobkitRepo> {
  // Failsafe reads every scalar as a string, so 1.10 stays a version.
  const workspace: unknown = parse(
    await readFile(join(robkitRoot, "pnpm-workspace.yaml"), "utf8"),
    { schema: "failsafe" },
  );
  const root = await readManifest(robkitRoot);
  if (!root.packageManager) {
    throw new Error(
      `${join(robkitRoot, "package.json")} has no packageManager, which names the pnpm an install uses. Put it back, such as "packageManager": "pnpm@11.28.9".`,
    );
  }

  const packages = new Map<string, RobkitPackage>();
  const packagesDir = join(robkitRoot, "packages");
  for (const entry of await readdir(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(packagesDir, entry.name);
    const manifest = await readManifestJson(dir);
    const { name, version } = stringsIn(manifest);
    if (name !== undefined && isRobkitPackage(name) && version) {
      packages.set(name, {
        version,
        dir,
        dependencies: Object.keys(stringsIn(manifest.dependencies)).filter(
          isRobkitPackage,
        ),
      });
    }
  }

  return {
    catalog: new Map(
      Object.entries(isRecord(workspace) ? stringsIn(workspace.catalog) : {}),
    ),
    packageManager: root.packageManager,
    packages,
    lintPolicy: await readLintPolicy(),
  };
}
