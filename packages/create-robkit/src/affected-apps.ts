import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";
import { CommandProblem } from "@robkit/dev/cli";
import {
  type InputProblem,
  isProblem,
  parseJson,
  type Slug,
} from "@robkit/input";
import { readAffectedApps } from "./env.ts";

/** What a failed child process said, without its trailing full stop. */
function saidBy(error: unknown): string {
  const said =
    error instanceof Error && "stderr" in error
      ? String(error.stderr).trim()
      : String(error);
  return said.replace(/\.$/, "");
}

/**
 * The commit the checkout at `root` is on, which robkit deploy records on
 * each application it deploys.
 *
 * @throws a {@link CommandProblem} outside a git checkout
 */
export async function headCommit(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  try {
    const { stdout } = await promisify(execFile)("git", ["rev-parse", "HEAD"], {
      cwd: root,
      env,
    });
    return stdout.trim();
  } catch (error) {
    throw new CommandProblem(
      `robkit deploy runs from the install's git checkout, and git couldn't name its commit: ${saidBy(error)}. Run it in the install's repository.`,
      { cause: error },
    );
  }
}

/**
 * The apps turbo finds changed since TURBO_SCM_BASE, by slug.
 *
 * @throws a {@link CommandProblem} with turbo's own message when
 *   `turbo ls` fails, such as outside a git repository
 */
export async function affectedApps(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Slug[] | InputProblem> {
  let stdout: string;
  try {
    ({ stdout } = await promisify(exec)("turbo ls --affected --output json", {
      cwd: root,
      env,
    }));
  } catch (error) {
    throw new CommandProblem(
      `turbo ls --affected couldn't find the apps that changed: ${saidBy(error)}. Name the apps to deploy with --apps, or deploy them all with --all.`,
      { cause: error },
    );
  }
  const parsed = parseJson(stdout, "turbo ls --affected's output");
  return isProblem(parsed) ? parsed : readAffectedApps(parsed.json);
}
