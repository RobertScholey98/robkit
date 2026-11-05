import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { isPlatformApp } from "@robkit/session/addresses";
import { checkInstall, describeProblem } from "./check.ts";
import { git, GitError, isRepo } from "./git.ts";
import {
  contractProblem,
  contractVersion,
  packageNameOf,
  type PackageJson,
} from "./manifest.ts";
import { newSlugProblem } from "./new-slug.ts";
import { ignoreApp, readInstallRecord, recordApp } from "./record.ts";

// An app repo: an app that is its own git repository, nested in the
// install, which the install's repository ignores. Sharing pushes it,
// installing clones it, and updating pulls it, so nothing here reads a
// stack's files: only git, the app's package.json and robkit.json.

/** What an app repo's own repository leaves out. */
const appIgnore = `node_modules/
dist/
.turbo/
.env
.env.*
!.env.example
`;

/** The folder of app `slug` in the install at `root`. */
export function appDir(root: string, slug: string): string {
  return join(root, "apps", slug);
}

/**
 * Has the install's repository ignore `apps/<slug>`, and stop tracking it
 * if it did, then records it in `robkit.json` unless it's there already.
 */
async function adopt(root: string, slug: string): Promise<void> {
  if (isRepo(root)) {
    await git(root, [
      "rm",
      "-r",
      "--cached",
      "--quiet",
      "--ignore-unmatch",
      `apps/${slug}`,
    ]);
  }
  await ignoreApp(root, slug);
  const { apps = {} } = await readInstallRecord(root);
  if (!(slug in apps)) await recordApp(root, slug, {});
}

/**
 * Makes `apps/<slug>` in the install at `root` an app repo, with everything
 * in it as the first commit, `message`.
 */
export async function makeAppRepo(
  root: string,
  slug: string,
  message: string,
): Promise<void> {
  const dir = appDir(root, slug);
  const ignore = join(dir, ".gitignore");
  if (!existsSync(ignore)) await writeFile(ignore, appIgnore);
  await git(dir, ["init", "--quiet", "--initial-branch=main"]);
  await git(dir, ["add", "--all"]);
  await git(dir, ["commit", "--quiet", "--message", message]);
  await adopt(root, slug);
}

/** Whether `target` is a git URL rather than a path on this machine. */
function isUrl(target: string): boolean {
  return (
    /^[a-z][a-z0-9+.-]*:\/\//i.test(target) ||
    /^[^/\\@]+@[^/\\:]+:/.test(target)
  );
}

/** A git URL as given, or a path made absolute from `cwd`. */
function located(target: string, cwd: string): string {
  return isUrl(target) ? target : resolve(cwd, target);
}

async function readPackageJson(dir: string): Promise<PackageJson | undefined> {
  try {
    return JSON.parse(
      await readFile(join(dir, "package.json"), "utf8"),
    ) as PackageJson;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function writePackageJson(dir: string, json: PackageJson): Promise<void> {
  await writeFile(
    join(dir, "package.json"),
    `${JSON.stringify(json, null, 2)}\n`,
  );
}

/** Where the app's `remote` points, if it has one. */
async function remoteOf(
  dir: string,
  remote: "origin" | "upstream",
): Promise<string | undefined> {
  try {
    return await git(dir, ["remote", "get-url", remote]);
  } catch (error) {
    if (error instanceof GitError) return undefined;
    throw error;
  }
}

/** Where the install shares the app to, and where a build fetches it. */
const originOf = (dir: string) => remoteOf(dir, "origin");

/**
 * Where the app's updates come from: where it was installed from, even
 * after the install shares it to a repo of its own, or else its origin.
 */
async function upstreamOf(
  dir: string,
): Promise<{ remote: "origin" | "upstream"; url: string } | undefined> {
  const upstream = await remoteOf(dir, "upstream");
  if (upstream !== undefined) return { remote: "upstream", url: upstream };
  const origin = await originOf(dir);
  return origin === undefined ? undefined : { remote: "origin", url: origin };
}

/**
 * Records app repo `slug` at its current commit, with its origin as its
 * source and its upstream when that's somewhere else.
 */
async function recordRepo(root: string, slug: string): Promise<string> {
  const dir = appDir(root, slug);
  const source = await originOf(dir);
  const upstream = await remoteOf(dir, "upstream");
  const revision = await git(dir, ["rev-parse", "HEAD"]);
  await recordApp(root, slug, {
    ...(source !== undefined && { source }),
    ...(upstream !== undefined && upstream !== source && { upstream }),
    revision,
  });
  return revision;
}

/** Commits everything the app has changed, if anything. */
async function commitChanges(dir: string, message: string): Promise<boolean> {
  if ((await git(dir, ["status", "--porcelain"])) === "") return false;
  await git(dir, ["add", "--all"]);
  await git(dir, ["commit", "--quiet", "--message", message]);
  return true;
}

/** Refuses an app robkit check finds a problem in, listing each. */
async function refuseUnlessChecked(
  root: string,
  slug: string,
  doing: string,
): Promise<void> {
  const problems = await checkInstall(root, { only: slug });
  if (problems.length === 0) return;
  throw new Error(
    `apps/${slug} can't be ${doing} until it keeps the layer rule. robkit check found:\n\n${problems.map((problem) => `  ${describeProblem(problem)}`).join("\n")}`,
  );
}

/** Where `share` puts an app with no origin: beside the install. */
export function defaultShareTarget(root: string, slug: string): string {
  return resolve(root, "..", "robkit-apps", `${slug}.git`);
}

export interface Shared {
  /** Where the app went, which later shares and builds use. */
  source: string;
  revision: string;
  /** Whether `share` made a new bare repository there. */
  created: boolean;
}

/**
 * Shares app `slug` of the install at `root`: commits whatever it has
 * changed, then pushes it to `target`, a git URL or a path, or else to its
 * origin, or else to a new bare repository beside the install. At a path
 * with no repository it makes a bare one. Its origin becomes where it went,
 * and `robkit.json` records it and the commit shared. An installed app
 * still updates from where it came from. An app that isn't an app repo
 * yet, such as init's example, becomes one first.
 */
export async function shareApp(
  root: string,
  slug: string,
  {
    target,
    message = `Share ${slug}`,
    cwd = root,
  }: { target?: string | undefined; message?: string; cwd?: string } = {},
): Promise<Shared> {
  await readInstallRecord(root);
  const dir = appDir(root, slug);
  if (isPlatformApp(slug)) {
    throw new Error(
      `${slug} comes with every install, so there's nothing to share.`,
    );
  }
  const manifest = await readPackageJson(dir);
  if (manifest === undefined) throw new Error(`apps/${slug} isn't an app.`);
  await refuseUnlessChecked(root, slug, "shared");
  if (manifest.robkit?.contract === undefined) {
    // Made before manifests named their contract, so made for this one.
    await writePackageJson(dir, {
      ...manifest,
      robkit: { ...manifest.robkit, contract: contractVersion },
    });
  }
  if (!isRepo(dir)) {
    await makeAppRepo(root, slug, `Make ${slug} an app repo`);
  }
  await commitChanges(dir, message);

  const origin = await originOf(dir);
  const source =
    target === undefined
      ? (origin ?? defaultShareTarget(root, slug))
      : located(target, cwd);
  const branch = await git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const created = !isUrl(source) && !existsSync(source);
  if (created) {
    await mkdir(dirname(source), { recursive: true });
    await git(dirname(source), [
      "init",
      "--bare",
      "--quiet",
      `--initial-branch=${branch}`,
      source,
    ]);
  }
  if (origin === undefined) {
    await git(dir, ["remote", "add", "origin", source]);
  } else if (origin !== source) {
    await git(dir, ["remote", "set-url", "origin", source]);
  }
  try {
    await git(dir, ["push", "--quiet", "--set-upstream", "origin", branch]);
  } catch (error) {
    if (
      error instanceof GitError &&
      /\[rejected\]|non-fast-forward|fetch first/.test(error.output)
    ) {
      throw new Error(
        `${source} has changes apps/${slug} doesn't. Bring them in with pnpm robkit update ${slug}, then share again.`,
        { cause: error },
      );
    }
    throw error;
  }
  const revision = await recordRepo(root, slug);
  return { source, revision, created };
}

/** The slug an app repo at `source` gets unless `--as` names one. */
export function slugFromSource(source: string): string {
  return basename(source.replace(/[/\\]+$/, "")).replace(/\.git$/, "");
}

export interface Installed {
  slug: string;
  /** What the app's manifest calls it. */
  name: string;
  description: string | undefined;
  source: string;
  revision: string;
}

/**
 * Installs the app repo at `source`, a git URL or a path, into the install
 * at `root` as `apps/<slug>`: clones it, refuses it unless its manifest
 * names a contract version this robkit runs and robkit check finds nothing
 * wrong in it, names its package after `slug`, and records it. The slug is
 * `as`, or else the repo's name.
 */
export async function installApp(
  root: string,
  given: string,
  { as, cwd = root }: { as?: string | undefined; cwd?: string } = {},
): Promise<Installed> {
  await readInstallRecord(root);
  const source = located(given, cwd);
  if (!isUrl(source) && !existsSync(source)) {
    throw new Error(`There's no app repo at ${source}.`);
  }
  const slug = as ?? slugFromSource(source);
  const problem = newSlugProblem(root, slug);
  if (problem) {
    // A platform app's folder exists too, but there's nothing to update.
    throw new Error(
      !isPlatformApp(slug) && existsSync(appDir(root, slug))
        ? `apps/${slug} already exists. Install it under another name with --as <name>, or bring in its changes with pnpm robkit update ${slug}.`
        : `${problem} Install it under another name with --as <name>.`,
    );
  }

  const dir = appDir(root, slug);
  await git(root, ["clone", "--quiet", source, dir]);
  try {
    const manifest = await readPackageJson(dir);
    if (manifest?.robkit === undefined) {
      throw new Error(
        `${source} isn't a robkit app: its package.json has no robkit field.`,
      );
    }
    const refused = contractProblem(manifest.robkit.contract);
    if (refused) throw new Error(`Can't install ${source}. ${refused}`);
    if (manifest.name !== packageNameOf(slug)) {
      await writePackageJson(dir, { ...manifest, name: packageNameOf(slug) });
      await git(dir, [
        "commit",
        "--quiet",
        "--all",
        "--message",
        `Install as ${slug}`,
      ]);
    }
    await refuseUnlessChecked(root, slug, "installed");
    // Updates keep coming from here, wherever the install shares it later.
    await git(dir, ["remote", "add", "upstream", source]);
    await adopt(root, slug);
    const revision = await recordRepo(root, slug);
    return {
      slug,
      name: manifest.robkit.name ?? slug,
      description: manifest.robkit.description,
      source,
      revision,
    };
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}

/** Git couldn't merge an app's upstream by itself. */
export class UpdateConflict extends Error {
  readonly files: readonly string[];

  constructor(slug: string, files: readonly string[]) {
    super(`Git couldn't merge the upstream's changes into apps/${slug} by itself. These files conflict:

${files.map((file) => `  ${file}`).join("\n")}

In each, keep what you want between the <<<<<<< and >>>>>>> markers, then:

  cd apps/${slug}
  git add --all
  git commit --no-edit

and run pnpm robkit update ${slug} again. To give up on this update instead:
git -C apps/${slug} merge --abort`);
    this.files = files;
  }
}

export interface Updated {
  source: string;
  revision: string;
  /** How many commits came in from upstream. */
  incoming: number;
}

/**
 * Pulls app repo `slug`'s upstream into the install at `root` with git.
 * Whatever this install changed in the app is committed first, so git
 * merges the two, and a clash stops as a git conflict. Refuses an upstream
 * whose manifest names a contract version this robkit can't run.
 */
export async function updateApp(root: string, slug: string): Promise<Updated> {
  await readInstallRecord(root);
  const dir = appDir(root, slug);
  if (!isRepo(dir)) {
    throw new Error(
      `apps/${slug} isn't an app repo, so it has no upstream to update from.`,
    );
  }
  const from = await upstreamOf(dir);
  if (from === undefined) {
    throw new Error(
      `apps/${slug} has no upstream: it was never shared or installed. Share it first with pnpm robkit share ${slug}.`,
    );
  }
  if ((await git(dir, ["ls-files", "--unmerged"])) !== "") {
    throw new UpdateConflict(
      slug,
      (await git(dir, ["diff", "--name-only", "--diff-filter=U"])).split("\n"),
    );
  }
  await commitChanges(dir, `Keep this install's changes to ${slug}`);
  await git(dir, ["fetch", "--quiet", from.remote]);
  const branch = await git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const upstream = `${from.remote}/${branch}`;
  const latest = JSON.parse(
    await git(dir, ["show", `${upstream}:package.json`]),
  ) as PackageJson;
  const refused = contractProblem(latest.robkit?.contract);
  if (refused) throw new Error(`Not updating apps/${slug}. ${refused}`);
  const incoming = Number(
    await git(dir, ["rev-list", "--count", `HEAD..${upstream}`]),
  );
  if (incoming > 0) {
    try {
      await git(dir, ["merge", "--quiet", "--no-edit", upstream]);
    } catch (error) {
      const conflicted = await git(dir, [
        "diff",
        "--name-only",
        "--diff-filter=U",
      ]);
      if (conflicted === "") throw error;
      throw new UpdateConflict(slug, conflicted.split("\n"));
    }
  }
  const revision = await recordRepo(root, slug);
  return { source: from.url, revision, incoming };
}

export interface Restored {
  /** The apps cloned again, by slug, each at the commit recorded. */
  restored: string[];
  /** Apps robkit.json lists but has no source for: never shared. */
  unshared: string[];
}

/**
 * Brings back every app repo `robkit.json` lists that the install at `root`
 * lacks, as a fresh clone of the install's repository does: clones each
 * from its source and checks out the commit recorded. An app that was never
 * shared has no source, so it can't come back; it's listed in `unshared`.
 */
export async function restoreApps(root: string): Promise<Restored> {
  const { apps = {} } = await readInstallRecord(root);
  const restored: string[] = [];
  const unshared: string[] = [];
  for (const [slug, { source, upstream, revision }] of Object.entries(apps)) {
    const dir = appDir(root, slug);
    if (existsSync(join(dir, "package.json"))) continue;
    if (source === undefined) {
      unshared.push(slug);
      continue;
    }
    await rm(dir, { recursive: true, force: true });
    await git(root, ["clone", "--quiet", source, dir]);
    if (revision !== undefined) {
      const branch = await git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
      await git(dir, ["checkout", "--quiet", "-B", branch, revision]);
    }
    if (upstream !== undefined) {
      await git(dir, ["remote", "add", "upstream", upstream]);
    }
    restored.push(slug);
  }
  return { restored, unshared };
}
