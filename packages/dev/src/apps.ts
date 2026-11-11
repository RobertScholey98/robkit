import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type InputProblem,
  isPlatformApp,
  isProblem,
  isRecord,
  parseJson,
  readSlug,
  type Slug,
  problem,
  type Domain,
} from "@robkit/input";
import {
  type AppManifest,
  appManifestJson,
  readAppManifest,
} from "@robkit/input/manifest";
import { install } from "@robkit/input/addresses";
import { isMissing } from "./files.ts";
import type { Route } from "./proxy.ts";
import { CommandProblem } from "@robkit/input/command";

/**
 * One folder under `apps/`. Its folder name is its slug, which is also its
 * subdomain. An app with a `migrate` script has a database: a schema and a
 * role named after its slug.
 */
export interface App {
  slug: Slug;
  dir: string;
  port: number;
  migrates: boolean;
  /**
   * What the manifest's `robkit` field declares for core's catalog: who may
   * open the app once core adds it, and its icon.
   */
  manifest: AppManifest;
}

/** What robkit reads from an app's `package.json`: its name, scripts and manifest. */
export interface AppManifestFile {
  name?: string;
  scripts: Record<string, string>;
  manifest: AppManifest;
}

function isScripts(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.values(value).every((command) => typeof command === "string")
  );
}

/** An app's `package.json`, read from `value`, whose path `file` names. */
export function readAppManifestFile(
  value: unknown,
  file: string,
): AppManifestFile | InputProblem {
  if (!isRecord(value)) {
    return problem(`${file} must be a JSON object, as npm expects.`);
  }
  const { name, scripts = {}, robkit } = value;
  if (name !== undefined && typeof name !== "string") {
    return problem(
      `${file}: name must be a string, such as "@internal/notes-app".`,
    );
  }
  if (!isScripts(scripts)) {
    return problem(
      `${file}: scripts must be an object of script names to commands.`,
    );
  }
  const manifest = readAppManifest(robkit);
  if (isProblem(manifest)) return problem(`${file}: ${manifest.error}`);
  return { ...(name !== undefined && { name }), scripts, manifest };
}

/**
 * The `package.json` of the app in `apps/<folder>` under `root`, or undefined if
 * the folder has none. Throws, naming the file, if it won't do.
 */
export async function appManifestFileIn(
  root: string,
  folder: string,
): Promise<AppManifestFile | undefined> {
  const file = `apps/${folder}/package.json`;
  let text: string;
  try {
    text = await readFile(join(root, file), "utf8");
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
  const parsed = parseJson(text, file);
  const read = isProblem(parsed)
    ? parsed
    : readAppManifestFile(parsed.json, file);
  if (isProblem(read)) throw new CommandProblem(read.error);
  return read;
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
      if (isMissing(error)) return [];
      throw error;
    },
  );
  const slugs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const apps: App[] = [];
  for (const name of slugs) {
    const dir = join(appsDir, name);
    const file = await appManifestFileIn(root, name);
    if (!file) continue;
    const slug = readSlug(name);
    if (isProblem(slug))
      throw new CommandProblem(`apps/${name}: ${slug.error}`);
    apps.push({
      slug,
      dir,
      port: firstPort + apps.length,
      migrates: file.scripts.migrate !== undefined,
      manifest: file.manifest,
    });
  }
  return apps;
}

export function routesFor(apps: readonly App[], domain: Domain): Route[] {
  return apps.map(({ slug, port }) => ({
    host: install({ domain }).host(slug),
    app: slug,
    port,
  }));
}

/**
 * `ROBKIT_APPS` for core: the owner's apps as JSON, each with what its
 * manifest declares. As core starts, its catalog becomes this list.
 */
export function catalogOf(apps: readonly App[]): string {
  return JSON.stringify(
    apps
      .filter((app) => !isPlatformApp(app.slug))
      .map(({ slug, manifest }) => ({ slug, ...appManifestJson(manifest) })),
  );
}
