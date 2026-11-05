import { execFile } from "node:child_process";
import { appendFile, cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { defaultChoices, init } from "create-robkit";

const run = promisify(execFile);

/** The sample app repo in this checkout, which lives outside any install. */
const guestbookSample = fileURLToPath(
  new URL("../../../examples/guestbook/", import.meta.url),
);

/** The app install A adds, changes and exports, and install B imports. */
export const sharedSlug = "notes";

/** What install A's change puts before the shared app's heading. */
export const greeting = "Hello from install A.";

/** The shared app's heading for a guest, after install A's change. */
export const changedHeading = `${greeting} Signed in as a guest`;

/** The row the shared app's seed puts in the table install A added. */
export const seededNote = "Seeded in install A";

/** One step of R's acceptance test, as `pnpm` ran it. */
export interface Step {
  command: string;
  ok: boolean;
  /** What it printed, when it failed. */
  output: string;
}

/** What R's acceptance test made, for the sharing suite to check. */
export interface Sharing {
  /** Holds everything below, side by side, as R's folders would be. */
  dir: string;
  a: string;
  b: string;
  /** The guestbook's own repo, outside any install. */
  guestbook: string;
  /** The repo robkit export wrote for install A's app. */
  exported: string;
  /** The exported repo's own install, lint, typecheck and test. */
  standalone: Step[];
}

declare module "vitest" {
  export interface ProvidedContext {
    sharing: Sharing;
  }
}

async function pnpm(dir: string, ...args: string[]): Promise<string> {
  const { stdout } = await run("pnpm", args, { cwd: dir });
  return stdout;
}

async function git(dir: string, ...args: string[]): Promise<void> {
  await run(
    "git",
    ["-c", "user.name=robkit", "-c", "user.email=robkit@example.com", ...args],
    { cwd: dir },
  );
}

/** Runs `pnpm <args>` in `dir`, noting whether it passed and what it said. */
async function step(dir: string, ...args: string[]): Promise<Step> {
  const command = `pnpm ${args.join(" ")}`;
  try {
    await run("pnpm", args, { cwd: dir, maxBuffer: 16 * 1024 * 1024 });
    return { command, ok: true, output: "" };
  } catch (error) {
    const { stdout = "", stderr = "" } = error as {
      stdout?: string;
      stderr?: string;
    };
    return { command, ok: false, output: `${stdout}\n${stderr}`.slice(-4000) };
  }
}

/**
 * R's acceptance test, up to the browser: install A imports the guestbook
 * from its own repo, adds `notes`, changes its page and its schema, with a
 * migration and a seed, and exports it. The export installs, lints,
 * typechecks and tests on its own. A fresh install B imports it. Every
 * install is made as `pnpm create-install` makes one, linked to this
 * checkout. It runs in the global setup, since installing beside a running
 * dev stack restarts its core.
 */
export async function shareAcrossInstalls(): Promise<Sharing> {
  const dir = await mkdtemp(join(tmpdir(), "robkit-sharing-"));
  const a = join(dir, "install-a");
  const b = join(dir, "install-b");
  const guestbook = join(dir, "guestbook");
  const exported = join(dir, sharedSlug);

  // The guestbook in a git repo of its own, as someone would share it.
  await cp(guestbookSample, guestbook, { recursive: true });
  await git(guestbook, "init", "--quiet");
  await git(guestbook, "add", "--all");
  await git(guestbook, "commit", "--quiet", "-m", "Guestbook");

  await init(defaultChoices, a, { link: true, install: true });
  await pnpm(a, "run", "robkit", "import", guestbook);
  await pnpm(
    a,
    ...["run", "robkit", "add", sharedSlug, "--stack", "start"],
    ...["--access", "open", "--icon", "📝"],
  );

  // The owner's change: the page, the schema with its migration, and a seed.
  const app = join(a, "apps", sharedSlug);
  const page = join(app, "src/routes/index.tsx");
  await writeFile(
    page,
    // As TESTING.md's sed does it.
    (await readFile(page, "utf8")).replaceAll(
      "Signed in as",
      `${greeting} Signed in as`,
    ),
  );
  await appendFile(
    join(app, "src/schema.ts"),
    `
/** A note anyone can read. */
export const note = pgTable("note", {
  id: serial().primaryKey(),
  body: text().notNull(),
});
`,
  );
  await pnpm(app, "run", "db:generate", "--name", "notes");
  await writeFile(
    join(app, "seed.sql"),
    `insert into note (body) values ('${seededNote}');\n`,
  );
  const manifestPath = join(app, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    robkit: Record<string, unknown>;
  };
  manifest.robkit.seed = "seed.sql";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  await pnpm(a, "run", "robkit", "export", sharedSlug);
  // pnpm on CI refuses an install with no lockfile unless told.
  const standalone = [await step(exported, "install", "--no-frozen-lockfile")];
  for (const script of ["lint", "typecheck", "test"]) {
    standalone.push(await step(exported, script));
  }

  await init(defaultChoices, b, { link: true, install: true });
  await pnpm(b, "run", "robkit", "import", exported);

  return { dir, a, b, guestbook, exported, standalone };
}
