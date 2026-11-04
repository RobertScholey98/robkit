import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { freePort, freePortBlock } from "@internal/test-postgres";
import { discoverApps } from "@robkit/dev";
import { parse } from "yaml";

const run = promisify(execFile);

/** A step of an install's own CI workflow. */
export interface Step {
  if?: string;
  "working-directory"?: string;
  run?: string;
}

/**
 * Whether a step's `if` holds in `dir`. The workflows' only condition is
 * that a file exists, as `hashFiles(<path>) != ''`.
 */
async function holds(condition: string | undefined, dir: string) {
  if (condition === undefined) return true;
  const path = /^hashFiles\('([^']+)'\) != ''$/.exec(condition)?.[1];
  if (path === undefined)
    throw new Error(`can't read the step's if: ${condition}`);
  return access(join(dir, path)).then(
    () => true,
    () => false,
  );
}

/** The `run` steps of the install's own CI workflow that hold in it, in order. */
export async function ownCiSteps(dir: string): Promise<Step[]> {
  const workflow = parse(
    await readFile(join(dir, ".github/workflows/ci.yml"), "utf8"),
  ) as { jobs: Record<string, { steps: Step[] }> };
  const steps: Step[] = [];
  for (const step of Object.values(workflow.jobs).flatMap((job) => job.steps)) {
    if (step.run !== undefined && (await holds(step.if, dir))) steps.push(step);
  }
  return steps;
}

/**
 * Runs the install's own CI steps, rejecting with the output of the first
 * that fails. It skips the install steps: init already installed the
 * dependencies, and installing again beside a running journey would touch
 * the files under its core and restart it. The browsers are this
 * checkout's own Playwright's, and installing their system packages needs
 * root.
 */
export async function runOwnCi(
  dir: string,
  steps: readonly Step[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  // The browser tests run the install's own dev stack, so they get free
  // ports.
  const withPorts = {
    ...env,
    ROBKIT_E2E_PORT: String(
      await freePortBlock(1 + (await discoverApps(dir)).length),
    ),
    ROBKIT_E2E_POSTGRES_PORT: String(await freePort()),
  };
  for (const step of steps) {
    if (/^\w+ install\b|playwright install\b/.test(step.run ?? "")) continue;
    await run("sh", ["-c", step.run ?? ""], {
      cwd: join(dir, step["working-directory"] ?? ""),
      env: withPorts,
    });
  }
}
