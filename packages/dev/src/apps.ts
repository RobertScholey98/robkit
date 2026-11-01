import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Route } from "./proxy.ts";

/**
 * One folder under `apps/`. Its folder name is its slug, which is also its
 * subdomain. An app with a `migrate` script has a database: a schema and a
 * role named after its slug.
 */
export interface App {
  slug: string;
  dir: string;
  port: number;
  migrates: boolean;
}

interface PackageJson {
  scripts?: Record<string, string>;
}

async function readManifest(dir: string): Promise<PackageJson | undefined> {
  try {
    return JSON.parse(
      await readFile(join(dir, "package.json"), "utf8"),
    ) as PackageJson;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/**
 * Finds the install's apps, giving them ports from `firstPort` upward in slug
 * order so each app gets the same port on every run.
 */
export async function discoverApps(
  root: string,
  firstPort = 3001,
): Promise<App[]> {
  const appsDir = join(root, "apps");
  const entries = await readdir(appsDir, { withFileTypes: true }).catch(
    (error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    },
  );
  const slugs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const apps: App[] = [];
  for (const slug of slugs) {
    const dir = join(appsDir, slug);
    const manifest = await readManifest(dir);
    if (!manifest) continue;
    apps.push({
      slug,
      dir,
      port: firstPort + apps.length,
      migrates: manifest.scripts?.migrate !== undefined,
    });
  }
  return apps;
}

export function routesFor(apps: readonly App[], domain: string): Route[] {
  return apps.map(({ slug, port }) => ({
    host: `${slug}.${domain}`,
    app: slug,
    port,
  }));
}
