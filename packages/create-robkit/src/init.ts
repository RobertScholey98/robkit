import type { Choices } from "./choices.ts";
import { generateInstall, type GenerateOptions } from "./generate.ts";
import { initGit, installDependencies } from "./set-up.ts";
import { writeInstall } from "./write.ts";

export interface InitOptions extends GenerateOptions {
  /**
   * Install the dependencies and initialise git once the install is written.
   * Off by default, as on the command line without `--install`.
   */
  install?: boolean;
}

/**
 * Takes init's choices to a finished install in `dir`, which must be empty
 * or not exist yet. It generates the install, writes it, and with `install`
 * installs its dependencies and initialises git, in that order. The command
 * line and the whole-stack test both make their installs with it.
 */
export async function init(
  choices: Choices,
  dir: string,
  { install = false, ...options }: InitOptions = {},
): Promise<void> {
  await writeInstall(dir, await generateInstall(choices, options));
  if (!install) return;
  await installDependencies(dir, choices.packageManager);
  await initGit(dir);
}
