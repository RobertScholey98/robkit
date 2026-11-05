import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { isPlatformApp } from "@robkit/session/addresses";
import { checkInstall, describeProblem } from "./check.ts";
import { git, GitError, isRepo } from "./git.ts";
import { contractVersion, type PackageJson } from "./manifest.ts";
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

/** The app's upstream: its `origin` remote, if it has one. */
async function originOf(dir: string): Promise<string | undefined> {
  try {
    return await git(dir, ["remote", "get-url", "origin"]);
  } catch (error) {
    if (error instanceof GitError) return undefined;
    throw error;
  }
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

/** Where `share` puts an app with no upstream: beside the install. */
export function defaultShareTarget(root: string, slug: string): string {
  return resolve(root, "..", "robkit-apps", `${slug}.git`);
}

export interface Shared {
  /** Where the app now lives upstream. */
  source: string;
  revision: string;
  /** Whether `share` made a new bare repository there. */
  created: boolean;
}

/**
 * Shares app `slug` of the install at `root`: commits whatever it has
 * changed, then pushes it to `target`, a git URL or a path, or else to its
 * upstream, or else to a new bare repository beside the install. At a path
 * with no repository it makes a bare one. The app's upstream becomes where
 * it went, and `robkit.json` records it and the commit shared. An app that
 * isn't an app repo yet, such as init's example, becomes one first.
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
  const revision = await git(dir, ["rev-parse", "HEAD"]);
  await recordApp(root, slug, { source, revision });
  return { source, revision, created };
}
