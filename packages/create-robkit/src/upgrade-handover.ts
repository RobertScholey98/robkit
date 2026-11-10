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
// To change the first step in a later version, copy this file, change the
// copy, and have upgrade.ts import the copy. Keep this file and its test.
//
// It imports nothing but `node:` modules, `yaml` and `@robkit/dev/cli`'s
// `exec` and `CommandProblem`, and loads nothing once `pnpm install` has
// run, since that install replaces the files this robkit runs from.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CommandProblem } from "@robkit/dev/cli";

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
