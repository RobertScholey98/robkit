import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { isRecord } from "@robkit/input";
import { parse } from "yaml";

const run = promisify(execFile);

/** A step of an install's own CI workflow. */
export interface Step {
  run?: string;
}

/**
 * The `run` steps of the install's own CI workflow, in order, from each job
 * a pull request runs. A job with an `if`, such as deploy on a push to
 * main, is left out, so a COOLIFY_URL in the environment deploys nothing.
 */
export async function ownCiSteps(dir: string): Promise<Step[]> {
  const path = join(dir, ".github/workflows/ci.yml");
  const workflow: unknown = parse(await readFile(path, "utf8"));
  const jobs = isRecord(workflow) ? workflow.jobs : undefined;
  if (!isRecord(jobs)) {
    throw new Error(`${path} has no jobs.`);
  }
  return Object.entries(jobs).flatMap(([name, job]) => {
    if (isRecord(job) && job.if !== undefined) return [];
    const steps = isRecord(job) ? job.steps : undefined;
    if (!Array.isArray(steps)) {
      throw new Error(`${path}'s job ${name} has no steps.`);
    }
    return steps.flatMap((step): Step[] => {
      const run = isRecord(step) ? step.run : undefined;
      return typeof run === "string" ? [{ run }] : [];
    });
  });
}

/**
 * Runs the install's own CI steps, rejecting with the output of the first
 * that fails. It skips the install steps: init already installed the
 * dependencies, and installing again beside a running journey would touch
 * the files under its core and restart it.
 */
export async function runOwnCi(
  dir: string,
  steps: readonly Step[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  for (const step of steps) {
    if (/^\w+ install\b/.test(step.run ?? "")) continue;
    await run("sh", ["-c", step.run ?? ""], {
      cwd: dir,
      env,
      maxBuffer: 64 * 1024 * 1024,
    }).catch((error: unknown) => {
      // Lint and typecheck print their problems on stdout, which the
      // error's message leaves out.
      const { stdout = "", stderr = "" } = error as {
        stdout?: string;
        stderr?: string;
      };
      throw new Error(
        `\`${step.run ?? ""}\` failed:\n${stdout.slice(-20_000)}\n${stderr.slice(-20_000)}`,
        { cause: error },
      );
    });
  }
}
