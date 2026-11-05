import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { format } from "prettier";
import type { Choices } from "./choices.ts";

/**
 * Where an app repo comes from: the remote or path it was installed from or
 * last shared to, and the commit the install runs. An app never shared has
 * neither. An app installed from one place and shared to another also
 * names its upstream, where updates still come from.
 */
export interface AppSource {
  source?: string;
  upstream?: string;
  revision?: string;
}

/**
 * `robkit.json`: init's choices, and each app repo in the install, by slug.
 * The install's own repository ignores its app repos, so this is how a
 * clone of it, or a deploy, finds them again.
 */
export interface InstallRecord extends Choices {
  apps?: Record<string, AppSource>;
}

const recordFile = "robkit.json";

/** The install's `robkit.json`, refusing a folder that has none. */
export async function readInstallRecord(root: string): Promise<InstallRecord> {
  let text: string;
  try {
    text = await readFile(join(root, recordFile), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    throw new Error(
      `${root} has no robkit.json. Run robkit add in an install's folder.`,
      { cause: error },
    );
  }
  return JSON.parse(text) as InstallRecord;
}

/** Records app repo `slug` in the install's `robkit.json` as `entry`. */
export async function recordApp(
  root: string,
  slug: string,
  entry: AppSource,
): Promise<void> {
  const record = await readInstallRecord(root);
  const apps = { ...record.apps, [slug]: entry };
  const sorted = Object.fromEntries(
    Object.entries(apps).sort(([a], [b]) => (a < b ? -1 : 1)),
  );
  await writeFile(
    join(root, recordFile),
    await format(JSON.stringify({ ...record, apps: sorted }), {
      filepath: recordFile,
    }),
  );
}

const ignoreHeading =
  "# App repos. Each is its own git repository, and robkit.json records\n# where it comes from.";

/**
 * Has the install's repository ignore `apps/<slug>`, which is a repository
 * of its own.
 */
export async function ignoreApp(root: string, slug: string): Promise<void> {
  const path = join(root, ".gitignore");
  const text = existsSync(path) ? await readFile(path, "utf8") : "";
  const line = `/apps/${slug}/`;
  if (text.split("\n").includes(line)) return;
  const heading = text.includes(ignoreHeading) ? "" : `\n${ignoreHeading}\n`;
  const ending = text === "" || text.endsWith("\n") ? "" : "\n";
  await writeFile(path, `${text}${ending}${heading}${line}\n`);
}

/**
 * The app repos whose recorded commit changed from `before` to `after`, new
 * ones included. turbo can't see an app repo's own changes, since the
 * install's repository ignores it, so a deploy takes these as changed too.
 */
export function movedAppRepos(
  before: InstallRecord | undefined,
  after: InstallRecord,
): string[] {
  return Object.entries(after.apps ?? {})
    .filter(
      ([slug, { revision }]) => before?.apps?.[slug]?.revision !== revision,
    )
    .map(([slug]) => slug);
}
