import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { CommandProblem, isMissing } from "@robkit/dev/cli";
import {
  type InputProblem,
  isPlatformApp,
  isProblem,
  isRecord,
  parseJson,
  platformApps,
  readSlug,
  type Slug,
} from "@robkit/input";
import { type DeclaredAccess } from "@robkit/input/manifest";
import { readChoices, type Choices, type Stack } from "./choices.ts";
import { appFiles, readFolder, stackTemplate, type Files } from "./generate.ts";
import { writeInstall } from "./write.ts";

/**
 * What robkit add asks: the stack, the app's slug, who may open it and its
 * icon.
 */
export interface AppChoices {
  stack: Stack;
  slug: Slug;
  /** Who may open the app once core adds it. A rule's roles are named. */
  access: DeclaredAccess;
  icon: string;
}

/** The choices init recorded in the install at `root`. */
export async function readInstallChoices(root: string): Promise<Choices> {
  let text: string;
  try {
    text = await readFile(join(root, "robkit.json"), "utf8");
  } catch (error) {
    if (!isMissing(error)) throw error;
    throw new CommandProblem(
      `${root} has no robkit.json. Run robkit add in an install's folder.`,
      { cause: error },
    );
  }
  const parsed = parseJson(text, "robkit.json");
  const choices = isProblem(parsed) ? parsed : readChoices(parsed.json);
  if (isProblem(choices)) throw new CommandProblem(choices.error);
  return choices;
}

/** "a, b and c". */
function andList(items: readonly string[]): string {
  const last = items.at(-1) ?? "";
  return items.length > 1
    ? `${items.slice(0, -1).join(", ")} and ${last}`
    : last;
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    (error: unknown) => {
      if (isMissing(error)) return false;
      throw error;
    },
  );
}

/** `name` as the slug of a new app in the install at `root`, or why it can't be. */
export function readNewSlug(root: string, name: string): Slug | InputProblem {
  const slug = readSlug(name);
  if (isProblem(slug)) return slug;
  if (isPlatformApp(slug)) {
    return {
      error: `${slug} is one of the platform apps: ${andList(platformApps)}.`,
    };
  }
  if (existsSync(join(root, "apps", slug))) {
    return { error: `apps/${slug} already exists. Choose another name.` };
  }
  return slug;
}

/**
 * Why `name` can't name a new app in the install at `root`, or `undefined`.
 * Its shape fits a prompt's `validate`.
 */
export function newSlugProblem(root: string, name: string): string | undefined {
  const slug = readNewSlug(root, name);
  return isProblem(slug) ? slug.error : undefined;
}

/**
 * The template robkit add uses for `stack` in the install at `root`: the
 * install's own `robkit/templates/<stack>` folder if it has one, which
 * replaces robkit's template whole, or else robkit's.
 *
 * @throws a {@link CommandProblem} naming the file if the install's own template
 *   has no `package.json` or one that isn't a JSON object, since the person
 *   owns it and can fix it
 */
async function templateFor(root: string, stack: Stack): Promise<Files> {
  const folder = `robkit/templates/${stack}`;
  const own = join(root, folder);
  if (!(await exists(own))) return stackTemplate(stack);
  const files = await readFolder(own);
  const text = files.get("package.json");
  if (text === undefined) {
    throw new CommandProblem(
      `${folder} has no package.json. Add one, or delete the folder to use robkit's template.`,
    );
  }
  const parsed = parseJson(text, `${folder}/package.json`);
  if (isProblem(parsed)) throw new CommandProblem(parsed.error);
  if (!isRecord(parsed.json)) {
    throw new CommandProblem(
      `${folder}/package.json must be a JSON object. Fix it, or delete ${folder} to use robkit's template.`,
    );
  }
  return files;
}

/**
 * Writes a new app at `apps/<slug>` in the install at `root`, on one of
 * robkit's stacks. It writes files only: `pnpm dev`, or the
 * provision step before a deploy, gives the app its database, and core adds
 * it to its catalog with the rule it declares.
 */
export async function addApp(root: string, choices: AppChoices): Promise<void> {
  // Refuses a folder that isn't an install.
  await readInstallChoices(root);
  const problem = newSlugProblem(root, choices.slug);
  if (problem) throw new CommandProblem(problem);
  const template = await templateFor(root, choices.stack);
  await writeInstall(
    join(root, "apps", choices.slug),
    appFiles(template, choices.slug, {
      access: choices.access,
      icon: choices.icon,
    }),
  );
}
