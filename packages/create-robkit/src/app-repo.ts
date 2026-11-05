import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { git, isRepo } from "./git.ts";
import { ignoreApp, readInstallRecord, recordApp } from "./record.ts";

// An app repo: an app that is its own git repository, nested in the
// install, which the install's repository ignores. Sharing pushes it,
// installing clones it, and updating pulls it, so nothing here reads a
// stack's files.

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
