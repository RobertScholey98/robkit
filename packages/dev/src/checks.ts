import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { promisify } from "node:util";
import { CommandProblem } from "@robkit/input/command";
import type { App } from "./apps.ts";
import { loopback } from "./proxy.ts";

const run = promisify(execFile);

/** How long Docker gets to answer before `pnpm dev` says it isn't. */
const dockerTimeoutMs = 20_000;

/** What `robkit-dev` needs free before it starts anything. */
export interface Needs {
  /** The install's folder, where Compose finds its project. */
  root: string;
  /** The environment Docker and Compose run with. */
  env: NodeJS.ProcessEnv;
  /** `ROBKIT_DEV_PORT`, where the proxy listens. */
  devPort: number;
  /** `ROBKIT_POSTGRES_PORT`, where Compose publishes Postgres. */
  postgresPort: number;
  /** The apps, each with the port it listens on. */
  apps: readonly App[];
}

/** The problem when the proxy's port is taken, such as by another `pnpm dev`. */
export function proxyPortProblem(port: number): CommandProblem {
  return new CommandProblem(
    `Port ${String(port)} is taken, and pnpm dev's proxy needs it. If pnpm dev is already running in this install, use that one or stop it. Otherwise free the port, or set ROBKIT_DEV_PORT in this install's .env to another port.`,
  );
}

function appPortProblem(app: App): CommandProblem {
  return new CommandProblem(
    `Port ${String(app.port)} is taken, and ${app.slug} needs it under pnpm dev. Free it, or set ROBKIT_DEV_PORT in this install's .env to move every app's port: they follow the proxy's.`,
  );
}

function postgresPortProblem(port: number): CommandProblem {
  return new CommandProblem(
    `Port ${String(port)} is taken, and this install's Postgres needs it. Free it, or set ROBKIT_POSTGRES_PORT in this install's .env to another port.`,
  );
}

/** Whether `error` is the system error with one of `codes`. */
function hasCode(error: unknown, ...codes: string[]): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    codes.includes(error.code)
  );
}

/**
 * Whether something holds `port` on `host`: it tries to listen there, and
 * closes at once. A host the machine lacks, as one with IPv6 off lacks
 * `::1`, holds nothing.
 *
 * @throws when the listen fails for any other reason
 */
export async function isTaken(port: number, host: string): Promise<boolean> {
  const server = createServer();
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, resolve);
    });
  } catch (error) {
    if (hasCode(error, "EADDRINUSE", "EACCES")) return true;
    if (hasCode(error, "EADDRNOTAVAIL", "EAFNOSUPPORT")) return false;
    throw new Error(`robkit-dev couldn't check port ${String(port)}.`, {
      cause: error,
    });
  }
  await new Promise((resolve) => server.close(resolve));
  return false;
}

/** Whether something holds `port` on any of `hosts`. */
async function takenOnAny(
  port: number,
  hosts: readonly string[],
): Promise<boolean> {
  for (const host of hosts) {
    if (await isTaken(port, host)) return true;
  }
  return false;
}

/** The problem when Docker isn't installed or doesn't answer, if it doesn't. */
async function dockerProblem(
  env: NodeJS.ProcessEnv,
): Promise<CommandProblem | undefined> {
  try {
    await run("docker", ["version", "--format", "{{.Server.Version}}"], {
      env,
      timeout: dockerTimeoutMs,
    });
    return undefined;
  } catch (error) {
    if (hasCode(error, "ENOENT")) {
      return new CommandProblem(
        "Docker isn't installed, or isn't on your PATH, and pnpm dev runs Postgres in it. Install Docker, then run pnpm dev again.",
        { cause: error },
      );
    }
    return new CommandProblem(
      "Docker isn't answering, and pnpm dev runs Postgres in it. Start Docker, then run pnpm dev again.",
      { cause: error },
    );
  }
}

/**
 * What a Docker command printed, a line each, such as the ids of the
 * containers it lists.
 *
 * @throws a {@link CommandProblem} with Docker's message when it fails,
 *   such as on a compose.yaml Compose can't read
 */
async function dockerLines(
  args: string[],
  { root, env }: Pick<Needs, "root" | "env">,
): Promise<string[]> {
  let stdout: string;
  try {
    ({ stdout } = await run("docker", args, {
      cwd: root,
      env,
      timeout: dockerTimeoutMs,
    }));
  } catch (error) {
    const said =
      error instanceof Error && "stderr" in error
        ? String(error.stderr).trim()
        : String(error);
    throw new CommandProblem(
      `docker ${args.join(" ")} failed in ${root}: ${said.replace(/\.$/, "")}. Fix what it says, then run pnpm dev again.`,
      { cause: error },
    );
  }
  return stdout.split("\n").filter((line) => line !== "");
}

/**
 * Whether something but this install's own Postgres holds `postgresPort`.
 * Docker may publish a port from a VM of its own, as Docker Desktop does,
 * so a container that publishes it counts even when the port looks free
 * here. This install's Postgres, left running by a runner that was killed,
 * doesn't count: `compose up` takes it over.
 */
async function postgresPortTaken(needs: Needs): Promise<boolean> {
  const own = new Set(
    await dockerLines(
      ["compose", "ps", "--quiet", "--no-trunc", "postgres"],
      needs,
    ),
  );
  const publishers = await dockerLines(
    [
      "ps",
      "--quiet",
      "--no-trunc",
      "--filter",
      `publish=${String(needs.postgresPort)}`,
    ],
    needs,
  );
  if (publishers.some((id) => !own.has(id))) return true;
  if (publishers.length > 0) return false;
  return isTaken(needs.postgresPort, "127.0.0.1");
}

/**
 * Checks, before `robkit-dev` starts anything, that Docker answers and that
 * every port it needs is free: the proxy's, each app's and Postgres's. It
 * reads and stops nothing, so a second `pnpm dev` leaves the first running.
 * Docker not answering is reported alone, as is the proxy's port: another
 * `pnpm dev` holds the apps' ports too, and moving `ROBKIT_DEV_PORT` moves
 * them all.
 *
 * @throws a {@link CommandProblem} for one failure, or an AggregateError of
 *   them for several, each saying what to do
 */
export async function checkBeforeStart(needs: Needs): Promise<void> {
  const docker = await dockerProblem(needs.env);
  if (docker) throw docker;
  if (await takenOnAny(needs.devPort, loopback)) {
    throw proxyPortProblem(needs.devPort);
  }
  const problems: CommandProblem[] = [];
  for (const app of needs.apps) {
    if (await isTaken(app.port, "127.0.0.1")) {
      problems.push(appPortProblem(app));
    }
  }
  if (await postgresPortTaken(needs)) {
    problems.push(postgresPortProblem(needs.postgresPort));
  }
  const [only, ...more] = problems;
  if (only && more.length === 0) throw only;
  if (only) {
    throw new AggregateError(
      problems,
      `${String(problems.length)} ports pnpm dev needs are taken.`,
    );
  }
}
