import { randomBytes } from "node:crypto";
import { basename, resolve } from "node:path";
import type { Choices } from "./choices.ts";
import { generateInstall, type GenerateOptions } from "./generate.ts";
import { initGit, installDependencies } from "./set-up.ts";
import { writeInstall } from "./write.ts";

export interface InitOptions extends Omit<GenerateOptions, "project"> {
  /**
   * Initialise git and install the dependencies once the install is written.
   * Off by default, as on the command line without `--install`.
   */
  install?: boolean;
}

/**
 * The Compose project of a new install in `dir`: the folder's name as
 * Compose spells a project, then a random suffix, so two installs in
 * folders of one name never share a Postgres.
 */
function composeProjectFor(dir: string): string {
  const name =
    basename(resolve(dir))
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^[^a-z0-9]+/, "") || "robkit";
  return `${name}-${randomBytes(3).toString("hex")}`;
}

/**
 * Takes init's choices to a finished install in `dir`, which must be empty
 * or not exist yet. It generates the install, writes it, and with `install`
 * initialises git and installs its dependencies, in that order, so an
 * install script that sets up git hooks, as Husky's does, finds the
 * repository. The command line and the whole-stack test both make their
 * installs with it.
 */
export async function init(
  choices: Choices,
  dir: string,
  { install = false, ...options }: InitOptions = {},
): Promise<void> {
  await writeInstall(
    dir,
    await generateInstall(choices, {
      ...options,
      project: composeProjectFor(dir),
    }),
  );
  if (!install) return;
  await initGit(dir);
  await installDependencies(dir);
}
