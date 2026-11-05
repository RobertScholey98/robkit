import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { install, isPlatformApp } from "@robkit/session/addresses";
import type { Route } from "./proxy.ts";
import { slugProblem } from "./slug.ts";

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
  /**
   * Whether the app has a seed: a `seed.sql` in its folder, which the
   * provision step runs once, when it first makes the app's schema.
   */
  seeds: boolean;
  /**
   * What the manifest's `robkit` field declares for core's catalog: who may
   * open the app once core adds it, and its icon. Core checks both.
   */
  declares: Declares;
}

/** An app's seed, by convention, at the root of its folder. */
export const seedFile = "seed.sql";

export interface Declares {
  access?: unknown;
  icon?: unknown;
}

interface PackageJson {
  scripts?: Record<string, string>;
  robkit?: Declares;
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
 * order so each app gets the same port on every run. Throws, naming the
 * folder, if an app's folder name can't be a slug.
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
    const problem = slugProblem(slug);
    if (problem) throw new Error(`apps/${slug}: ${problem}`);
    apps.push({
      slug,
      dir,
      port: firstPort + apps.length,
      migrates: manifest.scripts?.migrate !== undefined,
      seeds: existsSync(join(dir, seedFile)),
      declares: {
        access: manifest.robkit?.access,
        icon: manifest.robkit?.icon,
      },
    });
  }
  return apps;
}

export function routesFor(apps: readonly App[], domain: string): Route[] {
  return apps.map(({ slug, port }) => ({
    host: install({ domain }).host(slug),
    app: slug,
    port,
  }));
}

/**
 * `ROBKIT_APPS` for core: the owner's apps as JSON, each with what its
 * manifest declares. Core adds any it doesn't know to its catalog when it
 * starts.
 */
export function catalogOf(apps: readonly App[]): string {
  return JSON.stringify(
    apps
      .filter((app) => !isPlatformApp(app.slug))
      .map(({ slug, declares }) => ({ slug, ...declares })),
  );
}
