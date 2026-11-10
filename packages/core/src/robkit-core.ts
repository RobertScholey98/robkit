import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { constants } from "node:os";
import { basename, dirname, extname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isProblem, readDatabaseUrl, type Env } from "@robkit/input";
import { CommandProblem } from "@robkit/input/command";
import {
  provisionDatabases,
  readProvisionConfig,
  type ProvisionRefusal,
} from "@robkit/provision";
import { readCoreConfig } from "./env.ts";
import { migrate } from "./migrate.ts";
import { serveCore } from "./serve-core.ts";

const usage = `Usage: robkit-core <command>

  start    gives each app its database, migrates core's, then serves core
  migrate  migrates core's database
  serve    serves core, for pnpm dev, which has given each app its database`;

/** The variables only the provision step reads, which hold every app's keys. */
const provisionSecrets = ["ROBKIT_ADMIN_DATABASE_URL", "ROBKIT_DB_SECRET"];

/** The module the serving process runs: `serving.ts`, or `.js` once built. */
const servingFile = fileURLToPath(
  new URL(
    `./serving${extname(fileURLToPath(import.meta.url))}`,
    import.meta.url,
  ),
);

/**
 * `robkit-core`: core's one command, which an install's `apps/core` runs.
 * Throws a {@link CommandProblem} for a command it doesn't know, or for a
 * setting that won't do.
 *
 * @returns the exit code
 */
export async function robkitCore(
  args: readonly string[],
  env: Env,
): Promise<number> {
  const [command, ...rest] = args;
  if (rest.length > 0 || command === undefined) {
    throw new CommandProblem(usage);
  }
  switch (command) {
    case "start": {
      // A setting the serving process would refuse stops start before it
      // touches the database.
      const config = readCoreConfig(env);
      if (isProblem(config)) throw new CommandProblem(config.error);
      await provision(env);
      await migrateCore(env);
      return serveWithoutSecrets(env);
    }
    case "migrate":
      await migrateCore(env);
      return 0;
    case "serve": {
      const own = fileURLToPath(import.meta.url);
      if (!watches(own)) return serveCore(env);
      return runChild([...(await watchFlags(own)), servingFile], env);
    }
    default:
      throw new CommandProblem(
        `robkit-core has no command "${command}".\n\n${usage}`,
      );
  }
}

/**
 * The provision step, when the install asks for it. With both of its
 * settings it gives each app in `ROBKIT_DATABASES` its database; with
 * neither it says it skips the step. With one alone it stops: a typo must
 * not leave apps without a database in silence.
 */
async function provision(env: Env): Promise<void> {
  const set = provisionSecrets.filter((name) => (env[name] ?? "") !== "");
  if (set.length === 0) {
    console.log(
      "Skipping the provision step: ROBKIT_ADMIN_DATABASE_URL and ROBKIT_DB_SECRET aren't set.",
    );
    return;
  }
  const config = readProvisionConfig(env);
  if (isProblem(config)) throw new CommandProblem(config.error);
  const provisioned = await provisionDatabases(config);
  if (provisioned.outcome !== "provisioned") {
    throw new CommandProblem(refusalMessage(provisioned));
  }
  console.log(`provisioned ${config.slugs.join(", ")}`);
}

function refusalMessage(refusal: ProvisionRefusal): string {
  switch (refusal.outcome) {
    case "short-secret":
      return `robkit-core can't derive the apps' database passwords. ${refusal.error} Set ROBKIT_DB_SECRET to the install's secret.`;
    case "not-a-slug":
    case "own-role":
    case "superuser":
      return `robkit-core can't give ${refusal.slug} its database. ${refusal.error} Rename the app, or take it out of ROBKIT_DATABASES.`;
  }
}

async function migrateCore(env: Env): Promise<void> {
  const databaseUrl = readDatabaseUrl(env);
  if (isProblem(databaseUrl)) throw new CommandProblem(databaseUrl.error);
  await migrate(databaseUrl);
  console.log("core migrated");
}

/**
 * Serves core in a child process whose environment holds neither
 * provisioning secret, so nothing core logs or dumps of its own
 * environment carries them. It is not a wall: the container was started
 * with them, and code inside it can read them from `/proc`.
 *
 * A child rather than `process.execve`, which is still experimental in
 * Node 24, isn't on Windows, and would cut off output still on its way to
 * a pipe. This process passes SIGTERM and SIGINT on and waits, so the
 * server stops as Docker asks.
 */
function serveWithoutSecrets(env: Env): Promise<number> {
  const serving = Object.fromEntries(
    Object.entries(env).filter(([name]) => !provisionSecrets.includes(name)),
  );
  return runChild([servingFile], serving);
}

/**
 * Whether `serve` runs core under Node's watch mode: only when its own file
 * isn't under a `node_modules` folder, which is true only of a robkit
 * checkout an install links to. Node resolves the link, so the file is the
 * checkout's. A packed or vendored install runs no watcher.
 */
export function watches(file: string): boolean {
  return !file.split(sep).includes("node_modules");
}

/**
 * Node's flags for what `serve` watches in a robkit checkout, given
 * core's own `file` there: a `--watch-path` for the source of each of
 * robkit's packages, core's among them, so an edit to any restarts core.
 * Node's plain `--watch` would watch every file core imports, and so its
 * dependencies under `node_modules`. pnpm links those from its store, and
 * Node takes a file's new hard link for a change, so every `pnpm install`
 * on the machine restarted core.
 */
export async function watchFlags(file: string): Promise<string[]> {
  const source = dirname(file);
  const packages = join(source, "..", "..");
  const entries = await readdir(packages, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packages, entry.name, basename(source)))
    .filter((folder) => existsSync(folder))
    .map((folder) => `--watch-path=${folder}`);
}

/**
 * Runs Node with `args` and `env`, passing SIGTERM and SIGINT on to it, and
 * waits for it to exit.
 *
 * @returns its exit code, or 128 plus the signal's number if one ended it
 */
function runChild(args: string[], env: Env): Promise<number> {
  const child = spawn(process.execPath, args, { env, stdio: "inherit" });
  const passOn = (signal: NodeJS.Signals) => {
    child.kill(signal);
  };
  process.on("SIGTERM", passOn);
  process.on("SIGINT", passOn);
  return new Promise((resolve, reject) => {
    const done = () => {
      process.off("SIGTERM", passOn);
      process.off("SIGINT", passOn);
    };
    child.once("error", (error) => {
      done();
      reject(error);
    });
    child.once("exit", (code, signal) => {
      done();
      resolve(code ?? 128 + (signal ? constants.signals[signal] : 0));
    });
  });
}
