import { spawn } from "node:child_process";
import { once } from "node:events";
import { windowsCommandLine } from "./exec.ts";
import { CommandProblem } from "./run-command.ts";

/** The oldest Node and pnpm majors robkit runs on. */
const oldest = { node: 24, pnpm: 11 };

/** How long a version or `docker info` call may take. */
const probeTimeoutMs = 15_000;

const again = "then run pnpm dev again.";

type Probe =
  | { outcome: "answered"; output: string }
  | { outcome: "failed"; output: string };

/**
 * Runs `command` in `cwd` and reads what it prints. It fails if it can't
 * start, exits non-zero or takes longer than {@link probeTimeoutMs}. On
 * Windows the shell starts it, as `exec` does.
 */
async function probe(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<Probe> {
  const windows = process.platform === "win32";
  const child = spawn(
    windows ? windowsCommandLine(command, args) : command,
    windows ? [] : args,
    {
      cwd,
      env,
      shell: windows,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: probeTimeoutMs,
    },
  );
  let output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    output += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    output += chunk;
  });
  try {
    const closed: unknown[] = await once(child, "close");
    const [code] = closed;
    output = output.trim();
    return code === 0
      ? { outcome: "answered", output }
      : { outcome: "failed", output };
  } catch (error) {
    // The command couldn't start, which the caller reports as missing.
    return { outcome: "failed", output: String(error) };
  }
}

/** The major version in text such as `v24.1.0` or `11.28.9`, or NaN. */
function majorOf(version: string): number {
  return Number(/^v?(\d+)\./.exec(version)?.[1]);
}

/** What is wrong with the running Node, if anything. */
function nodeProblem(version: string): string | undefined {
  if (majorOf(version) >= oldest.node) return undefined;
  const node = String(oldest.node);
  return `robkit needs Node ${node} or later, and this is Node ${version}. Install Node ${node}, such as with nvm install ${node}, ${again}`;
}

/** What is wrong with pnpm, if anything. */
function pnpmProblem(answer: Probe): string | undefined {
  if (answer.outcome === "failed") {
    return `pnpm --version didn't run. Install pnpm ${String(oldest.pnpm)} with corepack enable, ${again}`;
  }
  if (majorOf(answer.output) >= oldest.pnpm) return undefined;
  return `robkit needs pnpm ${String(oldest.pnpm)} or later, and pnpm --version says ${answer.output}. Run corepack enable, so pnpm is the version the install's package.json pins, ${again}`;
}

/** What is wrong with Docker, if anything. */
function dockerProblems(version: Probe, info: Probe, compose: Probe): string[] {
  // Without docker itself, info and compose fail too, and say nothing new.
  if (version.outcome === "failed") {
    return [
      `docker --version didn't run. Install Docker (Docker Desktop, or Docker Engine and Docker Compose), ${again}`,
    ];
  }
  const problems: string[] = [];
  if (info.outcome === "failed") {
    const said = info.output.split("\n").find((line) => line.trim() !== "");
    problems.push(
      `docker info couldn't reach Docker${said ? `: ${said.trim()}` : "."} Start Docker Desktop, or Docker's daemon, ${again}`,
    );
  }
  if (compose.outcome === "failed") {
    problems.push(
      `docker compose version didn't run. Install Docker Compose, ${again}`,
    );
  }
  return problems;
}

/**
 * Checks what `robkit-dev` needs before it starts anything: Node 24 or later,
 * pnpm 11 or later, and Docker with Compose, answering. Runs pnpm and docker
 * in `root` with `env`, so pnpm is the version the install pins.
 *
 * @param nodeVersion the running Node's version, which tests replace
 * @throws a {@link CommandProblem} saying what to install or start, naming
 *   every prerequisite that isn't ready
 */
export async function checkPrerequisites(
  root: string,
  env: NodeJS.ProcessEnv,
  nodeVersion: string = process.versions.node,
): Promise<void> {
  const [pnpm, version, info, compose] = await Promise.all([
    probe("pnpm", ["--version"], root, env),
    probe("docker", ["--version"], root, env),
    probe("docker", ["info"], root, env),
    probe("docker", ["compose", "version"], root, env),
  ]);
  const problems = [
    nodeProblem(nodeVersion),
    pnpmProblem(pnpm),
    ...dockerProblems(version, info, compose),
  ].filter((problem) => problem !== undefined);
  if (problems.length === 1) throw new CommandProblem(problems.join(""));
  if (problems.length > 1) {
    throw new CommandProblem(
      `robkit-dev can't start yet:\n${problems.map((problem) => `- ${problem}`).join("\n")}`,
    );
  }
}
