import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandProblem } from "@robkit/input/command";
import { describe, expect, it, onTestFinished } from "vitest";
import { robkitMigrate } from "./robkit-migrate.ts";

const databaseUrl = "postgres://notes:secret@localhost:5432/robkit";

const usage = `Usage: robkit-migrate [folder]

Applies the app's migrations that haven't run yet, from folder, or from
drizzle when it names none: where drizzle.config.ts's out puts them.
DATABASE_URL connects as the app's own role.`;

async function emptyFolder(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "robkit-migrate-"));
  onTestFinished(() => rm(folder, { recursive: true }));
  return folder;
}

describe("robkit-migrate", () => {
  it("fails with the reader's message when DATABASE_URL isn't set", async () => {
    await expect(robkitMigrate([], {})).rejects.toEqual(
      new CommandProblem(
        "DATABASE_URL is not set. Run the app with pnpm dev, which sets it, or set it to a postgres:// URL.",
      ),
    );
  });

  it("fails with the reader's message when DATABASE_URL isn't a postgres:// URL", async () => {
    await expect(
      robkitMigrate([], { DATABASE_URL: "notes.db" }),
    ).rejects.toEqual(
      new CommandProblem(
        "DATABASE_URL isn't a postgres:// URL. Set it to one, such as postgres://user:password@host:5432/database.",
      ),
    );
  });

  it("says how to use it when given more than a folder", async () => {
    await expect(
      robkitMigrate(["drizzle", "more"], { DATABASE_URL: databaseUrl }),
    ).rejects.toEqual(new CommandProblem(usage));
  });

  it("says how to use it when asked for help", async () => {
    await expect(
      robkitMigrate(["--help"], { DATABASE_URL: databaseUrl }),
    ).rejects.toEqual(new CommandProblem(usage));
  });

  it("says where it looked when the folder holds no migrations", async () => {
    const folder = await emptyFolder();

    await expect(
      robkitMigrate([folder], { DATABASE_URL: databaseUrl }),
    ).rejects.toEqual(
      new CommandProblem(
        `robkit-migrate found no migrations in ${folder}: it has no meta/_journal.json. Run pnpm db:generate to write them, or pass the folder drizzle.config.ts's out names, as robkit-migrate <folder>.`,
      ),
    );
  });
});
