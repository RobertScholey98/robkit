import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

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
  packages: Map<string, { version: string; dir: string }>;
}

const robkitRoot = fileURLToPath(new URL("../../../", import.meta.url));

interface Manifest {
  name?: string;
  version?: string;
  packageManager?: string;
}

async function readManifest(dir: string): Promise<Manifest> {
  return JSON.parse(
    await readFile(join(dir, "package.json"), "utf8"),
  ) as Manifest;
}

export async function readRobkitRepo(): Promise<RobkitRepo> {
  // Failsafe reads every scalar as a string, so 1.10 stays a version.
  const workspace = parse(
    await readFile(join(robkitRoot, "pnpm-workspace.yaml"), "utf8"),
    { schema: "failsafe" },
  ) as { catalog: Record<string, string> };
  const root = await readManifest(robkitRoot);
  if (!root.packageManager) {
    throw new Error("robkit's package.json has no packageManager");
  }

  const packages = new Map<string, { version: string; dir: string }>();
  const packagesDir = join(robkitRoot, "packages");
  for (const entry of await readdir(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(packagesDir, entry.name);
    const { name, version } = await readManifest(dir);
    // An install takes create-robkit for robkit add.
    if ((name?.startsWith("@robkit/") || name === "create-robkit") && version) {
      packages.set(name, { version, dir });
    }
  }

  return {
    catalog: new Map(Object.entries(workspace.catalog)),
    packageManager: root.packageManager,
    packages,
  };
}
