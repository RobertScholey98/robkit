import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CommandProblem, isMissing } from "@robkit/dev/cli";
import { isProblem, isRecord, parseJson } from "@robkit/input";
import { readInstallChoices } from "./add.ts";
import { defaultChoices, type Stack } from "./choices.ts";
import { generateInstall, pnpmSettings } from "./generate.ts";
import { initGit, installDependencies } from "./set-up.ts";
import { folderInUse, writeInstall } from "./write.ts";

/** The file in a preview that lists the files its last sync wrote. */
const record = ".robkit-preview.json";

/** What a sync runs once it has written files. Tests replace it. */
export interface PreviewSetUp {
  initGit: (dir: string) => Promise<void>;
  installDependencies: (dir: string) => Promise<void>;
}

export interface PreviewOptions {
  /** The example app's stack, for a new preview. An existing one keeps its own. */
  stack?: Stack | undefined;
  setUp?: PreviewSetUp;
}

/** What a sync did. */
export type PreviewSync =
  | { outcome: "made" }
  | {
      outcome: "updated";
      /** Files whose template differed from the preview's copy, by path. */
      written: string[];
      /** Files the last sync wrote that the templates no longer have. */
      removed: string[];
      /** Whether it installed again, because a manifest or pnpm's settings changed. */
      installed: boolean;
    };

/** Whether pnpm must install again after `path` changes. */
const changesDependencies = (path: string) =>
  path === pnpmSettings || path.endsWith("package.json");

/** The files the last sync wrote, from the record in `dir`, if there is one. */
async function recordedFiles(dir: string): Promise<string[] | undefined> {
  const file = join(dir, record);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
  const parsed = parseJson(text, file);
  const files =
    !isProblem(parsed) && isRecord(parsed.json) ? parsed.json.files : undefined;
  if (
    !Array.isArray(files) ||
    !files.every((path) => typeof path === "string")
  ) {
    throw new CommandProblem(
      `${file} isn't a list of the files pnpm preview-install wrote. Remove the folder, and pnpm preview-install makes it again.`,
    );
  }
  return files;
}

/** `path`'s text in `dir`, or undefined if it isn't there. */
async function textIn(dir: string, path: string): Promise<string | undefined> {
  try {
    return (await readFile(join(dir, path), "utf8")).replaceAll("\r\n", "\n");
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

/**
 * Keeps a linked install in `dir` up to date with this checkout's templates,
 * for working on them. The first sync makes the install, initialises git
 * and installs its dependencies. Each later one writes only the files whose
 * template changed, removes those the templates dropped, and installs again
 * only when a `package.json` or pnpm's settings changed. Files the
 * templates never had, such as the lockfile and `node_modules`, stay.
 *
 * @throws a {@link CommandProblem} for a folder in use that no sync made,
 *   or for a stack other than the one the preview was made on
 */
export async function syncPreview(
  dir: string,
  { stack, setUp = { initGit, installDependencies } }: PreviewOptions = {},
): Promise<PreviewSync> {
  const before = await recordedFiles(dir);
  if (before === undefined) {
    if (folderInUse(dir) !== undefined) {
      throw new CommandProblem(
        `${dir} has files, and no ${record} to say pnpm preview-install made it. Choose an empty folder, or the one it made before.`,
      );
    }
    const files = await generateInstall(
      { exampleStack: stack ?? defaultChoices.exampleStack },
      { link: true },
    );
    await writeInstall(dir, files);
    await setUp.initGit(dir);
    await setUp.installDependencies(dir);
    await writeRecord(dir, [...files.keys()]);
    return { outcome: "made" };
  }

  const choices = await readInstallChoices(dir);
  if (stack !== undefined && stack !== choices.exampleStack) {
    throw new CommandProblem(
      `${dir} is a preview of the ${choices.exampleStack} stack. Leave out --stack, or remove the folder to make it again on ${stack}.`,
    );
  }
  const files = await generateInstall(choices, { link: true });
  const written: string[] = [];
  for (const [path, text] of files) {
    if ((await textIn(dir, path)) === text) continue;
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), text);
    written.push(path);
  }
  const removed = before.filter((path) => !files.has(path));
  for (const path of removed) await rm(join(dir, path), { force: true });
  const installed = [...written, ...removed].some(changesDependencies);
  if (installed) await setUp.installDependencies(dir);
  await writeRecord(dir, [...files.keys()]);
  return { outcome: "updated", written, removed, installed };
}

function writeRecord(dir: string, files: string[]): Promise<void> {
  return writeFile(
    join(dir, record),
    `${JSON.stringify({ files }, null, 2)}\n`,
  );
}
