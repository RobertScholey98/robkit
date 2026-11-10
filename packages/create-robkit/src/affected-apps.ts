import { exec } from "node:child_process";
import { promisify } from "node:util";
import { CommandProblem } from "@robkit/dev/cli";
import {
  type InputProblem,
  isProblem,
  parseJson,
  type Slug,
} from "@robkit/input";
import { readAffectedApps } from "./env.ts";

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
    const said =
      error instanceof Error && "stderr" in error
        ? String(error.stderr).trim()
        : String(error);
    throw new CommandProblem(
      `turbo ls --affected couldn't find the apps that changed: ${said.replace(/\.$/, "")}. Name the apps to deploy with --apps, or deploy them all with --all.`,
      { cause: error },
    );
  }
  const parsed = parseJson(stdout, "turbo ls --affected's output");
  return isProblem(parsed) ? parsed : readAffectedApps(parsed.json);
}
