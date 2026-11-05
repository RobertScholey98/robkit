import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { slugProblem } from "@robkit/dev";
import { isPlatformApp, platformApps } from "@robkit/session/addresses";
import type { Stack } from "./choices.ts";
import { makeAppRepo } from "./app-repo.ts";
import { appFiles, readFolder, stackTemplate } from "./generate.ts";
import type { Access } from "./manifest.ts";
import { readInstallRecord } from "./record.ts";
import { writeInstall } from "./write.ts";

/**
 * What robkit add asks: the stack, the app's slug, who may open it and its
 * icon.
 */
export interface AppChoices {
  stack: Stack;
  slug: string;
  /** Who may open the app once core adds it. A rule's roles are named. */
  access: Access;
  icon: string;
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
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    },
  );
}

/**
 * Why `slug` can't name a new app in the install at `root`, or `undefined`.
 * Its shape fits a prompt's `validate`.
 */
export function newSlugProblem(root: string, slug: string): string | undefined {
  const problem = slugProblem(slug);
  if (problem) return problem;
  if (isPlatformApp(slug)) {
    return `${slug} is one of the platform apps: ${andList(platformApps)}.`;
  }
  if (existsSync(join(root, "apps", slug))) {
    return `apps/${slug} already exists. Choose another name.`;
  }
  return undefined;
}

/**
 * The template robkit add uses for `stack` in the install at `root`: the
 * install's own `robkit/templates/<stack>` folder if it has one, which
 * replaces robkit's template whole, or else robkit's.
 */
async function templateFor(root: string, stack: Stack) {
  const own = join(root, "robkit", "templates", stack);
  if (await exists(own)) return readFolder(own);
  return stackTemplate(stack);
}

/**
 * Writes a new app at `apps/<slug>` in the install at `root`, on one of
 * robkit's stacks, and makes it an app repo: its own git repository, which
 * the install's ignores and `robkit.json` records. It installs and runs
 * nothing: `pnpm dev`, or the provision step before a deploy, gives the app
 * its database, and core adds it to its catalog with the rule it declares.
 */
export async function addApp(root: string, choices: AppChoices): Promise<void> {
  // Refuses a folder that isn't an install.
  await readInstallRecord(root);
  const problem = newSlugProblem(root, choices.slug);
  if (problem) throw new Error(problem);
  const template = await templateFor(root, choices.stack);
  await writeInstall(
    join(root, "apps", choices.slug),
    appFiles(template, choices.slug, choices.stack, {
      access: choices.access,
      icon: choices.icon,
    }),
  );
  await makeAppRepo(
    root,
    choices.slug,
    `Add ${choices.slug} on robkit's ${choices.stack} stack`,
  );
}
