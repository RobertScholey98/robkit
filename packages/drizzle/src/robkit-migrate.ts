import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { isProblem, readDatabaseUrl, type Env } from "@robkit/input";
import { CommandProblem } from "@robkit/input/command";
import { migrate } from "./migrate.ts";

const usage = `Usage: robkit-migrate [folder]

Applies the app's migrations that haven't run yet, from folder, or from
drizzle when it names none: where drizzle.config.ts's out puts them.
DATABASE_URL connects as the app's own role.`;

/**
 * `robkit-migrate`: an app's `migrate` script. Applies the migrations in
 * the folder `args` names, or in `drizzle`, from the current folder, as
 * the app's role. Throws a {@link CommandProblem} for a setting or a
 * folder that won't do.
 *
 * @returns the exit code
 */
export async function robkitMigrate(
  args: readonly string[],
  env: Env,
): Promise<number> {
  const [given = "drizzle", ...rest] = args;
  if (rest.length > 0 || given.startsWith("-")) {
    throw new CommandProblem(usage);
  }
  const databaseUrl = readDatabaseUrl(env);
  if (isProblem(databaseUrl)) throw new CommandProblem(databaseUrl.error);
  const folder = resolve(given);
  if (!existsSync(join(folder, "meta", "_journal.json"))) {
    throw new CommandProblem(
      `robkit-migrate found no migrations in ${folder}: it has no meta/_journal.json. Run pnpm db:generate to write them, or pass the folder drizzle.config.ts's out names, as robkit-migrate <folder>.`,
    );
  }
  await migrate({ databaseUrl, folder });
  console.log("migrated");
  return 0;
}
