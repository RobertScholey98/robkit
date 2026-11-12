// robkit upgrade: moves an install to a newer robkit in two steps. The
// robkit the install has checks everything, then hands over in
// upgrade-handover.ts, which can't change once 0.1.0 is out. The robkit it
// installed then finishes here, in finishUpgrade, which can change in any
// version. An install that runs the tarballs robkit vendor packed moves to
// the registry in one step instead, in leaveVendor.

import {
  lstat,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { CommandProblem, devRunning, isMissing } from "@robkit/dev/cli";
import {
  type InputProblem,
  isProblem,
  isRecord,
  orThrow,
  parseJson,
  problem,
} from "@robkit/input";
import { format } from "prettier";
import { isMap, parse, parseDocument } from "yaml";
import { installCatalog, overridesIn, pnpmSettings } from "./generate.ts";
import { vendoredGoDir } from "./go-module.ts";
import { stringsIn } from "./json.ts";
import { readRobkitRepo, type RobkitRepo } from "./robkit-repo.ts";
import { installDependencies } from "./set-up.ts";
import { onPath, run } from "./toolchain.ts";
import { handOver, putBack } from "./upgrade-handover.ts";
import { vendorDir } from "./vendor.ts";

/** Where an install keeps robkit's lint policy, from its root. */
const lintPolicyDir = "tooling/eslint";

/** The folders upgrade replaces whole. */
const ownedFolders = [lintPolicyDir, vendoredGoDir];

/** The files upgrade writes, or pnpm writes for it. */
const ownedFiles = [pnpmSettings, "pnpm-lock.yaml", "package.json"];

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

/** The version robkit is at here, from create-robkit's own manifest. */
async function installedVersion(): Promise<string> {
  const path = new URL("../package.json", import.meta.url);
  const parsed = parseJson(await readFile(path, "utf8"), "package.json");
  const version = isProblem(parsed)
    ? undefined
    : stringsIn(parsed.json).version;
  if (version === undefined) {
    throw new Error(
      `create-robkit's own package.json, at ${path.href}, has no version.`,
    );
  }
  return version;
}

/** What the registry has of create-robkit. */
interface Published {
  latest: string;
  versions: string[];
}

/** `pnpm view`'s JSON for create-robkit's `dist-tags` and `versions`. */
export function readPublished(json: unknown): Published | InputProblem {
  const shape = problem(
    "pnpm view answered without create-robkit's dist-tags and versions.",
  );
  if (!isRecord(json)) return shape;
  const latest = stringsIn(json["dist-tags"]).latest;
  // pnpm gives a package with one version as a string.
  const versions =
    typeof json.versions === "string" ? [json.versions] : json.versions;
  if (latest === undefined || !Array.isArray(versions)) return shape;
  return {
    latest,
    versions: versions.filter((v): v is string => typeof v === "string"),
  };
}

/** Why pnpm couldn't ask the registry, `why`, as the owner sees it. */
const couldNotAsk = (why: string) =>
  new CommandProblem(
    `robkit upgrade couldn't ask the registry which versions of create-robkit it has: ${why.replace(/\.$/, "")}. Check your network and the registry pnpm uses (pnpm config get registry), then run pnpm robkit upgrade again.`,
  );

/**
 * What the registry the install's pnpm uses has of create-robkit. pnpm
 * reads its own settings, such as `pnpm_config_registry` or an `.npmrc`,
 * so a mirror works as it does for `pnpm install`.
 *
 * @returns an {@link InputProblem} with pnpm's words when the registry has
 *   no create-robkit, as npm had none before robkit's first release
 * @throws a {@link CommandProblem} when pnpm can't ask it
 */
async function published(
  root: string,
  env: NodeJS.ProcessEnv,
): Promise<Published | InputProblem> {
  const args = ["view", "create-robkit", "dist-tags", "versions", "--json"];
  const ran = await run("pnpm", args, { cwd: root, env });
  const parsed = parseJson(ran.stdout, "pnpm view's answer");
  if (ran.code !== 0) {
    const error = isProblem(parsed) ? undefined : parsed.json;
    const { code, message } = isRecord(error) ? stringsIn(error.error) : {};
    const why =
      message ??
      ((ran.stderr || ran.stdout).trim() ||
        `pnpm view exited with ${String(ran.code)}`);
    if (code === "ERR_PNPM_FETCH_404") return problem(why);
    throw couldNotAsk(why);
  }
  return orThrow(isProblem(parsed) ? parsed : readPublished(parsed.json));
}

/** Where robkit's packages come from in an install, by its overrides. */
type Source = "link" | "vendor" | "registry";

/** Where robkit's packages come from in the install whose settings these are. */
function sourceOf(settings: string): Source {
  const specs = Object.entries(overridesIn(settings))
    .filter(([name]) => isRobkit(name))
    .map(([, spec]) => spec);
  if (specs.some((spec) => spec.startsWith("link:"))) return "link";
  if (specs.some((spec) => spec.startsWith("file:"))) return "vendor";
  return "registry";
}

const commitCommands = `  git init
  git add --all
  git commit -m "Make a robkit install"
  git branch -M main`;

/**
 * Refuses an install git can't show the upgrade's changes in: git isn't
 * installed, the install has no commit, or it has a change or a file not
 * committed.
 */
async function requireCleanGit(
  root: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  if (!onPath("git", env)) {
    throw new CommandProblem(
      "robkit upgrade needs git, so git diff shows what it changes and git can undo it, and git isn't installed. Install git, commit the install, then run pnpm robkit upgrade again.",
    );
  }
  const options = { cwd: root, env };
  const head = await run(
    "git",
    ["rev-parse", "--verify", "--quiet", "HEAD"],
    options,
  );
  if (head.code !== 0) {
    throw new CommandProblem(
      `robkit upgrade needs the install committed in git, so git diff shows what it changes and git can undo it, and this install has no commit. Make one, then run pnpm robkit upgrade again:\n\n${commitCommands}`,
    );
  }
  const status = await run(
    "git",
    ["status", "--porcelain", "--untracked-files=all", "--", "."],
    options,
  );
  const lines = status.stdout.split("\n").filter(Boolean);
  if (lines.length > 0) {
    const listed = lines.map((line) => {
      const what = line.startsWith("??") ? "untracked" : "not committed";
      return `  ${line.slice(3)} (${what})`;
    });
    throw new CommandProblem(
      `robkit upgrade needs every change committed, so git diff shows only what it changes. Commit or remove these, then run pnpm robkit upgrade again:\n\n${listed.join("\n")}`,
    );
  }
}

/** Whether `path` is a link. A path that isn't there is none. */
async function isLink(path: string): Promise<boolean> {
  const stats = await lstat(path).catch((error: unknown) => {
    if (isMissing(error)) return undefined;
    throw error;
  });
  return stats?.isSymbolicLink() ?? false;
}

/**
 * Refuses a link at a file upgrade writes, at a folder it replaces whole,
 * or at any folder above one. Through a link it would write or remove
 * files outside the install, which git can't put back.
 */
async function refuseLinks(root: string): Promise<void> {
  for (const file of ownedFiles) {
    if (await isLink(join(root, file))) {
      throw new CommandProblem(
        `${file} is a link. robkit upgrade writes that file and follows no link. Put a file of its own in its place and commit it, then run pnpm robkit upgrade again.`,
      );
    }
  }
  for (const folder of ownedFolders) {
    const names = folder.split("/");
    for (const depth of names.keys()) {
      const link = names.slice(0, depth + 1).join("/");
      if (await isLink(join(root, link))) {
        throw new CommandProblem(
          `${link} is a link. robkit upgrade replaces ${folder} whole and follows no link. Put a folder of its own in its place and commit it, then run pnpm robkit upgrade again.`,
        );
      }
    }
  }
}

/** The version to move to: `given`, or the registry's newest. */
function target(
  from: string,
  given: string | undefined,
  { latest, versions }: Published,
): string | { nothing: string } {
  if (given === undefined) {
    if ((compareVersions(latest, from) ?? 0) <= 0) {
      return { nothing: `This install is on robkit ${from}, the newest.` };
    }
    return latest;
  }
  if (!versions.includes(given)) {
    throw new CommandProblem(
      `The registry has no create-robkit ${given}. Its newest is ${latest}. Run pnpm robkit upgrade with a version it has, or with none for the newest.`,
    );
  }
  const order = compareVersions(given, from) ?? 0;
  if (order === 0) {
    throw new CommandProblem(
      `This install is on robkit ${from} already. robkit upgrade moves forward only: give a newer version, or none for the newest.`,
    );
  }
  if (order < 0) {
    throw new CommandProblem(
      `${given} is older than robkit ${from}, which this install is on. robkit upgrade moves forward only. To go back, revert the commit that moved the install to ${from}.`,
    );
  }
  return given;
}

/**
 * `robkit upgrade [version]` in the install at `root`: checks everything,
 * then hands over to the robkit it installs, which finishes the upgrade.
 * In an install that runs the tarballs `robkit vendor` packed, it moves to
 * the registry's copy of this robkit itself, in {@link leaveVendor}.
 *
 * @returns a line to print when there is nothing to upgrade, what a move
 *   off vendor/robkit changed, or `undefined` once the upgrade is done
 * @throws a {@link CommandProblem} saying what to do, for each check that
 *   fails, before it changes anything
 */
export async function upgrade(
  root: string,
  given: string | undefined,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const settings = await readFile(join(root, pnpmSettings), "utf8");
  const source = sourceOf(settings);
  if (source === "link") {
    return "This install links to a robkit checkout, so robkit upgrade has nothing to move. Pull the checkout to update it.";
  }
  if (given !== undefined && compareVersions(given, given) === undefined) {
    throw new CommandProblem(
      `"${given}" isn't a version. Give one such as 0.2.0, or none for the newest.`,
    );
  }
  const from = await installedVersion();
  // Only the robkit running knows which packages it has, so it moves the
  // install to its own version and no other.
  if (source === "vendor" && given !== undefined && given !== from) {
    throw new CommandProblem(
      `robkit ${from} can move this install off vendor/robkit to ${from} only. To move to ${given}, run pnpm dlx --package create-robkit@${given} robkit upgrade.`,
    );
  }
  // The robkit running can be an older one that pnpm dlx fetched.
  const vendored = source === "vendor" ? newestRobkit(settings) : undefined;
  if (vendored !== undefined && (compareVersions(from, vendored) ?? 0) < 0) {
    throw new CommandProblem(
      `robkit ${from} is older than the robkit ${vendored} this install runs from vendor/robkit. robkit upgrade moves forward only, so wait for a release at ${vendored} or newer, then run pnpm dlx --package create-robkit robkit upgrade.`,
    );
  }
  await requireCleanGit(root, env);
  await refuseLinks(root);
  if (await devRunning(root, env)) {
    throw new CommandProblem(
      "pnpm dev is running in this install. An upgrade replaces the packages under every running app, so stop pnpm dev, then run pnpm robkit upgrade again.",
    );
  }
  // pnpm tries a registry it can't reach for over a minute before it says
  // so, so the owner hears what the wait is for.
  console.log("Asking the registry which versions of robkit it has.");
  const has = await published(root, env);
  if (source === "vendor") {
    if (isProblem(has) || !has.versions.includes(from)) {
      return `The registry has no robkit ${from}, so this install stays on the tarballs in vendor/robkit. To move to the newest robkit on the registry, run pnpm dlx --package create-robkit robkit upgrade. Before robkit is released, run pnpm robkit vendor --from <checkout> to take a newer robkit from a checkout.`;
    }
    return leaveVendor(root, from, env);
  }
  if (isProblem(has)) throw couldNotAsk(has.error);
  const to = target(from, given, has);
  if (typeof to !== "string") return to.nothing;
  await handOver(root, { from, to }, env);
  return undefined;
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

/** Whether `name` is one of robkit's own packages. */
const isRobkit = (name: string) =>
  name.startsWith("@robkit/") || name === "create-robkit";

/** A catalog entry as a version to compare, without a leading `^` or `~`. */
const specVersion = (spec: string) => spec.replace(/^[\^~]/, "");

/**
 * Adds each entry of `wanted` the catalog in `settings`, pnpm's settings,
 * lacks, and raises each it holds lower. It never lowers or removes one,
 * and keeps the file's comments.
 *
 * @returns the settings' new text and, by name, a line for each entry it
 *   changed
 */
async function raiseCatalog(
  settings: string,
  wanted: ReadonlyMap<string, string>,
): Promise<{ text: string; changed: Map<string, string> }> {
  // Failsafe reads every scalar as a string, so 1.10 stays a version.
  const held: unknown = parse(settings, { schema: "failsafe" });
  const catalog = isRecord(held) ? stringsIn(held.catalog) : {};
  const workspace = parseDocument(settings);
  const changed = new Map<string, string>();
  for (const [name, version] of wanted) {
    const spec = catalog[name];
    if (spec === undefined) {
      changed.set(name, `added ${name} ${version}`);
    } else if (
      (compareVersions(specVersion(spec), specVersion(version)) ?? 0) < 0
    ) {
      changed.set(name, `raised ${name} from ${spec} to ${version}`);
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
      if (isTarball(path)) return vendorDir;
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
 * installed runs as `robkit upgrade --finish <from>`. The first step moved
 * create-robkit alone, so this one raises the catalog's entry for each of
 * robkit's other packages, and adds or raises every other entry this
 * robkit needs. It replaces the install's lint policy, and its Go module
 * when it has a Go app, raises `packageManager`, and installs again if it
 * changed the catalog or `packageManager`. A failure puts back every file
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

  const changed = await changeLines(root, to, done, env);
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
  /**
   * A line for each catalog entry it added or raised, robkit's own packages
   * aside, which the summary names as one.
   */
  catalog: string[];
  /** The `packageManager` it set, if it raised it. */
  packageManager: string | undefined;
}

/** A line for each path the upgrade to `to` changed, saying what it did. */
async function changeLines(
  root: string,
  to: string,
  done: Finished,
  env: NodeJS.ProcessEnv,
): Promise<string[]> {
  const details = new Map([
    [pnpmSettings, [`robkit's packages at ${to}`, ...done.catalog].join("; ")],
    [
      "package.json",
      done.packageManager && `packageManager ${done.packageManager}`,
    ],
    [lintPolicyDir, `robkit ${to}'s lint policy`],
    [vendoredGoDir, `robkit ${to}'s Go module`],
    [vendorDir, "removed robkit's tarballs"],
  ]);
  return (await changedPaths(root, env)).map((path) => {
    const detail = details.get(path);
    return detail ? `  ${path}: ${detail}` : `  ${path}`;
  });
}

/**
 * The second step's changes, as {@link finishUpgrade} describes them. With
 * `reinstall`, it installs whatever it changed.
 */
async function finish(
  root: string,
  repo: RobkitRepo,
  env: NodeJS.ProcessEnv,
  reinstall = false,
): Promise<Finished> {
  // The first step checked, but this one can be run by hand.
  await refuseLinks(root);
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
  if (reinstall || catalog.changed.size > 0 || manifest !== undefined) {
    await installDependencies(root, env);
  }
  return {
    catalog: [...catalog.changed]
      .filter(([name]) => !isRobkit(name))
      .map(([, line]) => line),
    packageManager: manifest === undefined ? undefined : repo.packageManager,
  };
}

/** Whether `path`, from the install's root, is a tarball in vendor/robkit. */
const isTarball = (path: string) =>
  path.startsWith(`${vendorDir}/`) &&
  path.endsWith(".tgz") &&
  !path.slice(vendorDir.length + 1).includes("/");

/**
 * The newest version the catalog in `settings`, pnpm's settings, holds of
 * a robkit package, or `undefined` when it holds none. In a vendored
 * install that is the version `robkit vendor` packed.
 */
function newestRobkit(settings: string): string | undefined {
  // Failsafe reads every scalar as a string, so 1.10 stays a version.
  const held: unknown = parse(settings, { schema: "failsafe" });
  const catalog = isRecord(held) ? stringsIn(held.catalog) : {};
  let newest: string | undefined;
  for (const [name, spec] of Object.entries(catalog)) {
    if (!isRobkit(name)) continue;
    const version = specVersion(spec);
    if (newest === undefined || (compareVersions(version, newest) ?? 0) > 0) {
      newest = version;
    }
  }
  return newest;
}

/**
 * pnpm's settings, `settings`, taking robkit's packages from the registry
 * at the versions `repo` carries: no override names a tarball in
 * vendor/robkit, and each of robkit's catalog entries is at its version.
 * Every other override stays, the owner's for a package under one of
 * robkit's among them, such as `@robkit/core>postgres`.
 */
async function fromRegistry(
  settings: string,
  repo: RobkitRepo,
): Promise<string> {
  const workspace = parseDocument(settings);
  for (const [name, spec] of Object.entries(overridesIn(settings))) {
    if (spec.startsWith(`file:${vendorDir}/`)) {
      workspace.deleteIn(["overrides", name]);
    }
  }
  const overrides = workspace.get("overrides");
  if (isMap(overrides) && overrides.items.length === 0) {
    workspace.delete("overrides");
  }
  for (const [name, { version }] of repo.packages) {
    if (workspace.hasIn(["catalog", name])) {
      workspace.setIn(["catalog", name], version);
    }
  }
  return format(workspace.toString(), { filepath: pnpmSettings });
}

/**
 * Moves the install at `root`, which runs the tarballs `robkit vendor`
 * packed, to robkit `to` from the registry, `to` being the version running
 * here. It takes robkit's packages from the registry, does the second
 * step's work and installs. Only then does it remove the tarballs, since
 * {@link putBack} restores neither them nor anything else outside the
 * paths upgrade writes. vendor/robkit/go stays, as a Go app builds against
 * it either way.
 *
 * @returns what it changed and what to run next
 * @throws a {@link CommandProblem} saying it put the files back
 */
async function leaveVendor(
  root: string,
  to: string,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const repo = await readRobkitRepo();
  const settingsPath = join(root, pnpmSettings);
  // Ctrl+C reaches pnpm install, which then fails. This process outlives
  // it, so the files go back.
  const outlive = () => undefined;
  process.on("SIGINT", outlive);
  let done: Finished;
  try {
    await writeFile(
      settingsPath,
      await fromRegistry(await readFile(settingsPath, "utf8"), repo),
    );
    done = await finish(root, repo, env, true);
  } catch (error) {
    await putBack(root, env);
    if (!(error instanceof CommandProblem)) throw error;
    throw new CommandProblem(
      `robkit upgrade couldn't move this install to robkit ${to}: ${error.message} It put back every file it changed and kept the tarballs, so the install is as it was at your last commit. Run pnpm install to put node_modules back, and the same command to try again.`,
      { cause: error },
    );
  } finally {
    process.off("SIGINT", outlive);
  }
  const vendored = join(root, vendorDir);
  for (const file of await readdir(vendored)) {
    if (isTarball(`${vendorDir}/${file}`)) await rm(join(vendored, file));
  }
  const changed = await changeLines(root, to, done, env);
  return `Moved this install off the tarballs in vendor/robkit, to robkit ${to} from the registry. It changed:

${changed.join("\n")}

Next, read git diff, run pnpm lint, pnpm typecheck and pnpm test, then commit.`;
}
