import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { CommandProblem } from "@robkit/dev/cli";

/** The value of `name` in `env`, whatever its case, as Windows names PATH `Path`. */
function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const key = Object.keys(env).find((key) => key.toUpperCase() === name);
  return key === undefined ? undefined : env[key];
}

/** Whether `command` is a program on the PATH in `env`. */
export function onPath(command: string, env: NodeJS.ProcessEnv): boolean {
  const extensions =
    process.platform === "win32"
      ? (envValue(env, "PATHEXT") ?? ".COM;.EXE;.BAT;.CMD").split(";")
      : [""];
  const dirs = (envValue(env, "PATH") ?? "").split(delimiter).filter(Boolean);
  return dirs.some((dir) =>
    extensions.some((extension) => {
      try {
        accessSync(join(dir, command + extension), constants.X_OK);
        return true;
      } catch {
        // Not here, or not a program: look in the next folder.
        return false;
      }
    }),
  );
}

/** What a command printed and how it exited. */
export interface Ran {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** How long a command init runs for its checks or its commit may take. */
const runTimeoutMs = 120_000;

/**
 * Runs `command` with `args` in `cwd` and collects what it prints. On
 * Windows the shell starts it, since pnpm is a .cmd file there, so each of
 * `args` must be fixed text with no quote or `%` in it.
 */
export function run(
  command: string,
  args: string[],
  { cwd, env }: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<Ran> {
  const options = { cwd, env, timeout: runTimeoutMs };
  const quoted = args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg));
  const child =
    process.platform === "win32"
      ? spawn([command, ...quoted].join(" "), { ...options, shell: true })
      : spawn(command, args, options);
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

/** How to get a pnpm that runs any version: Corepack where Node ships it. */
function pnpmFix(env: NodeJS.ProcessEnv): string {
  const fix = onPath("corepack", env)
    ? "corepack enable"
    : "npm install -g pnpm";
  return `Run ${fix}, then run npm create robkit again.`;
}

/**
 * Checks that pnpm can install an install whose `packageManager` is
 * `packageManager`, such as `pnpm@11.28.9`. It asks `pnpm --version` in a
 * folder that names that version, where Corepack's pnpm and pnpm 10 or
 * later switch to it by themselves, so the answer is what the install
 * would run.
 *
 * @throws a {@link CommandProblem} saying how to get pnpm when it's
 *   missing or won't switch
 */
export async function requirePnpm(
  packageManager: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  if (!onPath("pnpm", env)) {
    throw new CommandProblem(
      `pnpm isn't installed, or isn't on your PATH, and init installs with it. ${pnpmFix(env)}`,
    );
  }
  const wanted = packageManager.replace(/^pnpm@/, "").replace(/\+.*$/, "");
  const dir = await mkdtemp(join(tmpdir(), "robkit-pnpm-"));
  try {
    await writeFile(
      join(dir, "package.json"),
      `${JSON.stringify({ packageManager })}\n`,
    );
    const { code, stdout, stderr } = await run("pnpm", ["--version"], {
      cwd: dir,
      // Corepack asks before it downloads a pnpm unless told not to.
      env: { ...env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
    });
    const version = stdout.trim();
    if (code !== 0) {
      throw new CommandProblem(
        `pnpm --version failed, so init can't tell whether pnpm can run pnpm ${wanted}, which the install uses. It said: ${(stderr || stdout).trim()}`,
      );
    }
    if (version !== wanted) {
      throw new CommandProblem(
        `pnpm ${version} can't run pnpm ${wanted}, which the install uses. ${pnpmFix(env)}`,
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * A warning when Docker is missing, which only `pnpm dev` needs, or
 * `undefined`.
 */
export function dockerNote(env: NodeJS.ProcessEnv): string | undefined {
  if (onPath("docker", env)) return undefined;
  return "Docker isn't installed, or isn't on your PATH. pnpm dev runs Postgres in it, so install it first: https://docs.docker.com/get-started/get-docker/";
}
