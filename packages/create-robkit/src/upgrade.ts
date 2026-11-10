// robkit upgrade: moves an install to a newer robkit in two steps. The
// robkit the install has checks everything, then hands over in
// upgrade-handover.ts, which can't change once 0.1.0 is out. The robkit it
// installed then finishes here, in finishUpgrade, which can change in any
// version.

import {
  lstat,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { CommandProblem, isMissing } from "@robkit/dev/cli";
import { isProblem, isRecord, parseJson } from "@robkit/input";
import { format } from "prettier";
import { parse, parseDocument } from "yaml";
import { installCatalog, pnpmSettings } from "./generate.ts";
import { vendoredGoDir } from "./go-module.ts";
import { stringsIn } from "./json.ts";
import type { RobkitRepo } from "./robkit-repo.ts";
import { installDependencies } from "./set-up.ts";
import { run } from "./toolchain.ts";
import { putBack } from "./upgrade-handover.ts";

/** Where an install keeps robkit's lint policy, from its root. */
const lintPolicyDir = "tooling/eslint";

/** The folders upgrade replaces whole, which it refuses as links. */
const ownedFolders = [lintPolicyDir, vendoredGoDir];

const versionPattern =
  /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** `a` against `b`, as semver orders them: below 0 when `a` is older. */
function compareParsed(a: RegExpExecArray, b: RegExpExecArray): number {
  for (const part of [1, 2, 3]) {
    const diff = Number(a[part]) - Number(b[part]);
    if (diff !== 0) return diff;
  }
  const [preA, preB] = [a[4], b[4]];
  // A version with no prerelease is newer than one with.
  if (preA === undefined || preB === undefined) {
    return (preA === undefined ? 1 : 0) - (preB === undefined ? 1 : 0);
  }
  const [idsA, idsB] = [preA.split("."), preB.split(".")];
  for (let i = 0; i < Math.min(idsA.length, idsB.length); i++) {
    const [x = "", y = ""] = [idsA[i], idsB[i]];
    if (x === y) continue;
    const [numX, numY] = [/^\d+$/.test(x), /^\d+$/.test(y)];
    if (numX && numY) return Number(x) - Number(y);
    // Numbers sort before words.
    if (numX !== numY) return numX ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return idsA.length - idsB.length;
}

/**
 * `a` against `b`, as semver orders them: below 0 when `a` is older, 0
 * when they're the same and above 0 when it's newer. `undefined` when
 * either isn't a version, such as `1.2` or `latest`.
 */
export function compareVersions(a: string, b: string): number | undefined {
  const [parsedA, parsedB] = [versionPattern.exec(a), versionPattern.exec(b)];
  if (parsedA === null || parsedB === null) return undefined;
  return compareParsed(parsedA, parsedB);
}

/** Every file under `dir`, by its path from there, or none if it's missing. */
async function filesIn(dir: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const entries = await readdir(dir, {
    recursive: true,
    withFileTypes: true,
  }).catch((error: unknown) => {
    if (isMissing(error)) return [];
    throw error;
  });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const file = join(entry.parentPath, entry.name);
    files.set(
      relative(dir, file).replaceAll("\\", "/"),
      await readFile(file, "utf8"),
    );
  }
  return files;
}

/**
 * Replaces the folder `folder` under `root` with `files`, by path from
 * there, unless it holds them already. It removes the folder first, so it
 * follows no link inside it.
 *
 * @returns whether it changed the folder
 */
async function replaceFolder(
  root: string,
  folder: string,
  files: ReadonlyMap<string, string>,
): Promise<boolean> {
  const dir = join(root, folder);
  const held = await filesIn(dir);
  const same =
    held.size === files.size &&
    [...files].every(([path, text]) => held.get(path) === text);
  if (same) return false;
  await rm(dir, { recursive: true, force: true });
  for (const [path, text] of files) {
    const file = join(dir, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
  }
  return true;
}

/** Whether the install at `root` has a Go app. */
async function hasGoApp(root: string): Promise<boolean> {
  const apps = await readdir(join(root, "apps"), { withFileTypes: true });
  for (const app of apps) {
    if (!app.isDirectory()) continue;
    const stats = await lstat(join(root, "apps", app.name, "go.mod")).catch(
      (error: unknown) => {
        if (isMissing(error)) return undefined;
        throw error;
      },
    );
    if (stats?.isFile()) return true;
  }
  return false;
}

/** A catalog entry as a version to compare, without a leading `^` or `~`. */
const specVersion = (spec: string) => spec.replace(/^[\^~]/, "");

/**
 * Adds each entry of `wanted` the catalog in `settings`, pnpm's settings,
 * lacks, and raises each it holds lower. It never lowers or removes one,
 * and keeps the file's comments.
 *
 * @returns the settings' new text and a line for each entry it changed
 */
async function raiseCatalog(
  settings: string,
  wanted: ReadonlyMap<string, string>,
): Promise<{ text: string; changed: string[] }> {
  // Failsafe reads every scalar as a string, so 1.10 stays a version.
  const held: unknown = parse(settings, { schema: "failsafe" });
  const catalog = isRecord(held) ? stringsIn(held.catalog) : {};
  const workspace = parseDocument(settings);
  const changed: string[] = [];
  for (const [name, version] of wanted) {
    const spec = catalog[name];
    if (spec === undefined) {
      changed.push(`added ${name} ${version}`);
    } else if (
      (compareVersions(specVersion(spec), specVersion(version)) ?? 0) < 0
    ) {
      changed.push(`raised ${name} from ${spec} to ${version}`);
    } else {
      continue;
    }
    workspace.setIn(["catalog", name], version);
  }
  const text = await format(workspace.toString(), { filepath: pnpmSettings });
  return { text, changed };
}

/** A `packageManager` value's pnpm version, such as `11.28.9`. */
const pnpmVersion = (spec: string) => /^pnpm@([^+]+)/.exec(spec)?.[1] ?? "";

/**
 * The root manifest's text with `packageManager` raised to `wanted`, or
 * `undefined` when its pnpm is that one or newer, or not pnpm.
 */
function raisePackageManager(text: string, wanted: string): string | undefined {
  const parsed = parseJson(text, "package.json");
  if (isProblem(parsed) || !isRecord(parsed.json)) {
    throw new CommandProblem(
      `The install's package.json isn't a JSON object. Fix it, then run pnpm robkit upgrade again.`,
    );
  }
  const held = stringsIn(parsed.json).packageManager;
  if (held !== undefined) {
    const order = compareVersions(pnpmVersion(held), pnpmVersion(wanted));
    if (order === undefined || order >= 0) return undefined;
  }
  return `${JSON.stringify({ ...parsed.json, packageManager: wanted }, null, 2)}\n`;
}

/**
 * The entries of create-robkit's changelog, `changelog`, for each version
 * after `from` up to `to`, or `undefined` when it has none. Its versions
 * are `## <version>` headings, newest first.
 */
export function changelogBetween(
  changelog: string,
  from: string,
  to: string,
): string | undefined {
  const sections = changelog.replaceAll("\r\n", "\n").split(/^(?=## )/m);
  const kept = sections.filter((section) => {
    const version = /^## (\S+)/.exec(section)?.[1];
    if (version === undefined) return false;
    return (
      (compareVersions(version, from) ?? 0) > 0 &&
      (compareVersions(version, to) ?? 1) <= 0
    );
  });
  const text = kept.join("").trim();
  return text === "" ? undefined : text;
}

/** The paths git says changed under `root`, a folder upgrade owns as one. */
async function changedPaths(
  root: string,
  env: NodeJS.ProcessEnv,
): Promise<string[]> {
  const { stdout } = await run(
    "git",
    ["status", "--porcelain", "--untracked-files=all", "--", "."],
    { cwd: root, env },
  );
  const paths = stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const path = line.slice(3);
      return (
        ownedFolders.find((folder) => path.startsWith(`${folder}/`)) ?? path
      );
    });
  return [...new Set(paths)].sort();
}

/** What the second step needs from the robkit running it. */
export interface Finishing {
  /** The version the first step ran as, which the install was on. */
  from: string;
  /** What this robkit carries: its catalog, pnpm, lint policy and Go module. */
  repo: RobkitRepo;
  /** create-robkit's changelog, as this version ships it, if it has one. */
  changelog: string | undefined;
  env: NodeJS.ProcessEnv;
}

/**
 * The second step of `robkit upgrade`, which the robkit the first step
 * installed runs as `robkit upgrade --finish <from>`. It replaces the
 * install's lint policy, and its Go module when it has a Go app, adds or
 * raises the catalog entries this robkit needs, raises `packageManager`,
 * and installs again if it changed either. A failure puts back every file
 * the upgrade changed, the first step's too.
 *
 * @returns what to print: what it did, the changelog and what to run next
 * @throws a {@link CommandProblem} saying it put the files back
 */
export async function finishUpgrade(
  root: string,
  { from, repo, changelog, env }: Finishing,
): Promise<string> {
  const to = repo.packages.get("create-robkit")?.version;
  if (to === undefined) {
    throw new Error(
      `The packages create-robkit carries, ${[...repo.packages.keys()].join(", ")}, leave out create-robkit.`,
    );
  }
  if (compareVersions(from, from) === undefined) {
    throw new CommandProblem(
      `robkit upgrade --finish takes the version the install was on, and "${from}" isn't one.`,
    );
  }
  let done: Finished;
  try {
    done = await finish(root, repo, env);
  } catch (error) {
    await putBack(root, env);
    if (!(error instanceof CommandProblem)) throw error;
    throw new CommandProblem(
      `robkit ${to} couldn't finish the upgrade: ${error.message}`,
      { cause: error },
    );
  }

  const details = new Map([
    [pnpmSettings, [`robkit's packages at ${to}`, ...done.catalog].join("; ")],
    [
      "package.json",
      done.packageManager && `packageManager ${done.packageManager}`,
    ],
    [lintPolicyDir, `robkit ${to}'s lint policy`],
    [vendoredGoDir, `robkit ${to}'s Go module`],
  ]);
  const changed = (await changedPaths(root, env)).map((path) => {
    const detail = details.get(path);
    return detail ? `  ${path}: ${detail}` : `  ${path}`;
  });
  const entries = changelog && changelogBetween(changelog, from, to);
  return `Upgraded robkit from ${from} to ${to}. It changed:

${changed.join("\n")}

${
  entries
    ? `create-robkit's changelog from ${from} to ${to}. It says what to change by hand in your apps, the hub and admin, which upgrade never rewrites:

${entries}`
    : `create-robkit's changelog has nothing between ${from} and ${to}.`
}

Next, read git diff, run pnpm lint, pnpm typecheck and pnpm test, then commit.`;
}

/** What the second step changed in the catalog and `packageManager`. */
interface Finished {
  /** A line for each catalog entry it added or raised. */
  catalog: string[];
  /** The `packageManager` it set, if it raised it. */
  packageManager: string | undefined;
}

/** The second step's changes, as {@link finishUpgrade} describes them. */
async function finish(
  root: string,
  repo: RobkitRepo,
  env: NodeJS.ProcessEnv,
): Promise<Finished> {
  const settingsPath = join(root, pnpmSettings);
  const settings = await readFile(settingsPath, "utf8");
  const catalog = await raiseCatalog(settings, await installCatalog(repo));
  if (catalog.text !== settings) await writeFile(settingsPath, catalog.text);

  const manifestPath = join(root, "package.json");
  const manifest = raisePackageManager(
    await readFile(manifestPath, "utf8"),
    repo.packageManager,
  );
  if (manifest !== undefined) await writeFile(manifestPath, manifest);

  await replaceFolder(root, lintPolicyDir, repo.lintPolicy);
  if (await hasGoApp(root)) {
    await replaceFolder(root, vendoredGoDir, repo.goModule);
  }
  if (catalog.changed.length > 0 || manifest !== undefined) {
    await installDependencies(root, env);
  }
  return {
    catalog: catalog.changed,
    packageManager: manifest === undefined ? undefined : repo.packageManager,
  };
}
