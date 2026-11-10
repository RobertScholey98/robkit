// FROZEN once robkit 0.1.0 is on npm. Don't change this file after that.
//
// This is how robkit upgrade's first step hands over to the robkit it
// installs. 0.1.0 ships it, so every install on 0.1.0 starts an upgrade
// with this code, whatever version it moves to, for as long as anyone
// upgrades from 0.1.0. The call it makes, `pnpm exec robkit upgrade
// --finish <old version>`, its one argument, and the state it leaves are
// then public, like an export: every later robkit must answer them.
// upgrade-handover.test.ts runs this file, then the current second step.
//
// What a later robkit's second step can count on from this one:
//
// - It runs as the `robkit` bin, in the install's root, in a tree that was
//   clean when the upgrade started. The catalog's create-robkit entry is at
//   its own version, that version is installed, and nothing else changed.
//   Every `@robkit/*` entry is still the old version's, so the second step
//   raises the ones its robkit has. This step asks the registry for no
//   package but create-robkit, so a later robkit can drop or rename any
//   other.
// - When it exits with anything but 0, this step puts back the five paths
//   in `ownedPaths` and no others, then says the second step failed. A
//   second step that writes anywhere else puts that back itself first.
// - When it exits 0, this step prints nothing more, so the second step's
//   last lines are the owner's.
//
// To change the first step in a later version, copy this file, change the
// copy, and have upgrade.ts import the copy. Keep this file and its test.
//
// It imports nothing but `node:` modules, `yaml` and `@robkit/dev/cli`'s
// `exec` and `CommandProblem`, and loads nothing once `pnpm install` has
// run, since that install replaces the files this robkit runs from.

import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { CommandProblem, exec } from "@robkit/dev/cli";
import { parseDocument } from "yaml";

const run = promisify(execFile);

/** The two folders upgrade replaces whole, from the install's root. */
const ownedFolders = ["tooling/eslint", "vendor/robkit/go"];

/** Every path upgrade writes, from the install's root. */
const ownedPaths = [
  "pnpm-workspace.yaml",
  "pnpm-lock.yaml",
  "package.json",
  ...ownedFolders,
];

/**
 * Puts back every path upgrade writes in the install at `root` as the last
 * commit has it, and removes what it added under them. The tree was clean
 * when upgrade started, so what changed there is upgrade's own.
 *
 * @throws a {@link CommandProblem} with the commands that do it by hand,
 *   when git fails
 */
export async function putBack(
  root: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const options = { cwd: root, env };
  try {
    const { stdout } = await run(
      "git",
      ["ls-tree", "--name-only", "HEAD", "--", ...ownedPaths],
      options,
    );
    const committed = stdout.split("\n").filter(Boolean);
    if (committed.length > 0) {
      await run("git", ["checkout", "HEAD", "--", ...committed], options);
    }
    await run("git", ["clean", "-fdq", "--", ...ownedPaths], options);
  } catch (error) {
    throw new CommandProblem(
      `robkit upgrade couldn't put back the files it changed. Run these in ${root}:

  git restore --source=HEAD --staged --worktree -- .
  git clean -fd -- ${ownedFolders.join(" ")}
  pnpm install`,
      { cause: error },
    );
  }
}

/** What to do once {@link putBack} has run, for a failure's message. */
const putBackNote =
  "robkit upgrade put back every file it changed, so the install is as it was at your last commit. Run pnpm install to put node_modules back, fix what the output above says, then run pnpm robkit upgrade again.";

/**
 * The first step of `robkit upgrade`, once its checks pass, in the install
 * at `root`: sets the catalog's entry for create-robkit to `to`, installs,
 * then runs `pnpm exec robkit upgrade --finish <from>`, which robkit `to`
 * answers. When either command fails, it puts the files back.
 *
 * @throws a {@link CommandProblem} naming the step that failed
 */
export async function handOver(
  root: string,
  { from, to }: { from: string; to: string },
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const path = join(root, "pnpm-workspace.yaml");
  const workspace = parseDocument(await readFile(path, "utf8"));
  workspace.setIn(["catalog", "create-robkit"], to);
  await writeFile(path, workspace.toString());

  console.log(`Installing robkit ${to}.`);
  try {
    await exec("pnpm", ["install", "--no-frozen-lockfile"], { cwd: root, env });
  } catch (error) {
    await putBack(root, env);
    throw new CommandProblem(
      `Step 1 of robkit upgrade failed: pnpm install couldn't install robkit ${to}. ${putBackNote}`,
      { cause: error },
    );
  }
  try {
    await exec("pnpm", ["exec", "robkit", "upgrade", "--finish", from], {
      cwd: root,
      env,
    });
  } catch (error) {
    await putBack(root, env);
    throw new CommandProblem(
      `Step 2 of robkit upgrade failed: robkit ${to} couldn't finish it. ${putBackNote}`,
      { cause: error },
    );
  }
}
