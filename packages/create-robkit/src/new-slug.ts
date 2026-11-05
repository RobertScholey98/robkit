import { existsSync } from "node:fs";
import { join } from "node:path";
import { slugProblem } from "@robkit/dev";
import { isPlatformApp, platformApps } from "@robkit/session/addresses";

/** "a, b and c". */
function andList(items: readonly string[]): string {
  const last = items.at(-1) ?? "";
  return items.length > 1
    ? `${items.slice(0, -1).join(", ")} and ${last}`
    : last;
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
