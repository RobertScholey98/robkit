import { requireGo } from "@robkit/dev/cli";
import { toolchainOf, type Choices } from "./choices.ts";
import { generateInstall, type GenerateOptions } from "./generate.ts";
import { jsonObject, stringsIn } from "./json.ts";
import { initGit, installDependencies } from "./set-up.ts";
import { dockerNote, requirePnpm } from "./toolchain.ts";
import { writeInstall } from "./write.ts";

export interface InitOptions extends GenerateOptions {
  /**
   * Initialise git and install the dependencies once the install is written.
   * On by default, as on the command line without `--no-install`.
   */
  install?: boolean;
  /** The environment init's checks and commands see. `process.env` by default. */
  env?: NodeJS.ProcessEnv;
}

/** What init has to tell the owner besides the next steps. */
export interface InitResult {
  /** One line each, such as a warning that Docker is missing. */
  notes: string[];
}

/**
 * Takes init's choices to a finished install in `dir`, which must be empty
 * or not exist yet. It checks what it needs, generates the install, writes
 * it, and unless told not to install, initialises git and installs its
 * dependencies, in that order, so an install script that sets up git
 * hooks, as Husky's does, finds the repository. The command line and the
 * whole-stack test both make their installs with it.
 *
 * Every check runs before it writes anything: Go for an example on React +
 * Go, and when it installs, a pnpm that can run the install's version.
 * Docker is only a note, since only `pnpm dev` needs it.
 */
export async function init(
  choices: Choices,
  dir: string,
  { install = true, env = process.env, ...options }: InitOptions = {},
): Promise<InitResult> {
  if (toolchainOf(choices.exampleStack) === "go") await requireGo(env);
  const files = await generateInstall(choices, options);
  const notes: string[] = [];
  if (install) {
    const manifest = jsonObject(
      files.get("package.json") ?? "",
      "package.json",
    );
    await requirePnpm(stringsIn(manifest).packageManager ?? "", env);
    const docker = dockerNote(env);
    if (docker) notes.push(docker);
  }
  await writeInstall(dir, files);
  if (!install) return { notes };
  await initGit(dir, env);
  await installDependencies(dir, env);
  return { notes };
}
