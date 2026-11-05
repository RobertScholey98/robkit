import { basename } from "node:path";
import type { Choices } from "./choices.ts";
import {
  composeProject,
  generateInstall,
  type GenerateOptions,
} from "./generate.ts";
import { initGit, installDependencies } from "./set-up.ts";
import { writeInstall } from "./write.ts";

export interface InitOptions extends GenerateOptions {
  /**
   * Initialise git and install the dependencies once the install is written.
   * Off by default, as on the command line without `--install`.
   */
  install?: boolean;
}

/**
 * Takes init's choices to a finished install in `dir`, which must be empty
 * or not exist yet. It generates the install, writes it, and with `install`
 * initialises git and installs its dependencies, in that order, so an
 * install script that sets up git hooks, as Husky's does, finds the
 * repository. The install's Compose project is its own, named after its
 * folder with a random suffix, so no two installs share a Postgres. The
 * command line and the whole-stack test both make their installs with it.
 */
export async function init(
  choices: Choices,
  dir: string,
  { install = false, ...options }: InitOptions = {},
): Promise<void> {
  await writeInstall(
    dir,
    await generateInstall(choices, {
      project: composeProject(basename(dir)),
      ...options,
    }),
  );
  if (!install) return;
  await initGit(dir);
  await installDependencies(dir);
}
