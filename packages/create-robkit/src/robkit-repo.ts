import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CommandProblem, isMissing } from "@robkit/dev/cli";
import { isRecord } from "@robkit/input";
import { parse } from "yaml";
import { readGoModule } from "./go-module.ts";
import { jsonObject, stringsIn } from "./json.ts";

/**
 * What an install takes from robkit: its catalog and manifests, its lint
 * policy and its Go module, so each version has one home. The generator
 * reads them from the robkit checkout it runs in, or from what
 * create-robkit's build wrote into the package. {@link readRobkitRepo}
 * decides which.
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
  /**
   * robkit's Go module, by path from its folder, without its tests: what
   * an install's Go apps build against, from `vendor/robkit/go`.
   */
  goModule: Map<string, string>;
  /**
   * Each package's folder in the checkout, by name, for an install made
   * with `--link` to link to. Empty for any other install.
   */
  links: Map<string, string>;
}

export interface RobkitPackage {
  version: string;
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

/** The robkit checkout this file sits in, when it runs from one. */
const robkitRoot = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * What create-robkit's build wrote beside this file in `dist`. The source
 * in `src` has none, so it reads the checkout it sits in.
 */
const carriedFile = fileURLToPath(new URL("./carried.json", import.meta.url));

/** A relative import of a JS file beside the importer, such as `"./x.js"`. */
const besideImport = /from "\.\/([\w.-]+\.js)"/g;

/** A file's text, with a Windows checkout's CRLF endings made LF. */
async function readText(path: string): Promise<string> {
  return (await readFile(path, "utf8")).replaceAll("\r\n", "\n");
}

/**
 * `policy.js` in the checkout's `tooling/eslint`, and each file it imports
 * from there, in turn, by name. Their packages come from the install's root.
 */
async function readLintPolicy(root: string): Promise<Map<string, string>> {
  const dir = join(root, "tooling", "eslint");
  const files = new Map<string, string>();
  const queue = ["policy.js"];
  for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
    if (files.has(name)) continue;
    const text = await readText(join(dir, name));
    files.set(name, text);
    for (const [, imported] of text.matchAll(besideImport)) {
      if (imported !== undefined) queue.push(imported);
    }
  }
  return files;
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

/**
 * robkit's packages under the checkout at `root`, by name, and the folder
 * each is in.
 */
async function readPackages(root: string) {
  const packages = new Map<string, RobkitPackage>();
  const folders = new Map<string, string>();
  const packagesDir = join(root, "packages");
  for (const entry of await readdir(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(packagesDir, entry.name);
    const manifest = await readManifestJson(dir);
    const { name, version } = stringsIn(manifest);
    if (name === undefined || !isRobkitPackage(name) || !version) continue;
    packages.set(name, {
      version,
      dependencies: Object.keys(stringsIn(manifest.dependencies)).filter(
        isRobkitPackage,
      ),
    });
    folders.set(name, dir);
  }
  return { packages, folders };
}

/** Everything an install takes from the robkit checkout at `root`. */
async function readCheckout(root: string) {
  let text: string;
  try {
    text = await readFile(join(root, "pnpm-workspace.yaml"), "utf8");
  } catch (error) {
    if (!isMissing(error)) throw error;
    throw new CommandProblem(
      `--link links an install to the robkit checkout create-robkit runs from, and ${root} isn't one. Run create-robkit from a clone of robkit: node packages/create-robkit/src/create-robkit-command.ts --link.`,
      { cause: error },
    );
  }
  // Failsafe reads every scalar as a string, so 1.10 stays a version.
  const workspace: unknown = parse(text, { schema: "failsafe" });
  const { packageManager } = stringsIn(await readManifestJson(root));
  if (!packageManager) {
    throw new Error(
      `${join(root, "package.json")} has no packageManager, which names the pnpm an install uses. Put it back, such as "packageManager": "pnpm@11.28.9".`,
    );
  }
  const { packages, folders } = await readPackages(root);
  return {
    catalog: new Map(
      Object.entries(isRecord(workspace) ? stringsIn(workspace.catalog) : {}),
    ),
    packageManager,
    packages,
    folders,
    lintPolicy: await readLintPolicy(root),
    goModule: await readGoModule(join(root, "go")),
  };
}

/**
 * Writes what an install takes from this checkout to `file`, as JSON, for
 * create-robkit to carry. Its build runs it, so the published package
 * needs no checkout.
 */
export async function carry(file: string): Promise<void> {
  const repo = await readCheckout(robkitRoot);
  const asObject = (map: Map<string, unknown>) => Object.fromEntries(map);
  await writeFile(
    file,
    `${JSON.stringify(
      {
        catalog: asObject(repo.catalog),
        packageManager: repo.packageManager,
        packages: asObject(repo.packages),
        lintPolicy: asObject(repo.lintPolicy),
        goModule: asObject(repo.goModule),
      },
      null,
      2,
    )}\n`,
  );
}

/** `value`'s string fields as a map, as {@link carry} wrote one. */
const stringMap = (value: unknown) => new Map(Object.entries(stringsIn(value)));

/**
 * What {@link carry} wrote to `file`. create-robkit's build wrote it, so a
 * file that doesn't parse is a fault in robkit, not the owner's to fix.
 */
export async function readCarried(file: string): Promise<RobkitRepo> {
  const json = jsonObject(await readFile(file, "utf8"), file);
  const { packageManager } = stringsIn(json);
  if (!packageManager) {
    throw new Error(
      `${file}, which create-robkit's build writes, names no packageManager.`,
    );
  }
  const packages = new Map<string, RobkitPackage>();
  for (const [name, pkg] of Object.entries(
    isRecord(json.packages) ? json.packages : {},
  )) {
    const { version } = stringsIn(pkg);
    const dependencies = isRecord(pkg) ? pkg.dependencies : undefined;
    if (!version || !Array.isArray(dependencies)) {
      throw new Error(
        `${file}, which create-robkit's build writes, has no version or dependencies for ${name}.`,
      );
    }
    packages.set(name, {
      version,
      dependencies: dependencies.filter((dep) => typeof dep === "string"),
    });
  }
  return {
    catalog: stringMap(json.catalog),
    packageManager,
    packages,
    lintPolicy: stringMap(json.lintPolicy),
    goModule: stringMap(json.goModule),
    links: new Map(),
  };
}

/**
 * What an install takes from robkit. With `link`, it reads the checkout
 * create-robkit runs from, and names each package's folder there. Without,
 * a built create-robkit reads what its build carries, so it needs no
 * checkout, and the source reads the checkout it sits in.
 */
export async function readRobkitRepo({
  link = false,
}: { link?: boolean } = {}): Promise<RobkitRepo> {
  if (!link && existsSync(carriedFile)) return readCarried(carriedFile);
  const { folders, ...repo } = await readCheckout(robkitRoot);
  return { ...repo, links: link ? folders : new Map<string, string>() };
}
