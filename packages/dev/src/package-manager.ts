import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The package manager that runs the scripts of the install at `root`: the
 * one its root manifest's `packageManager` names, or pnpm. Every manager
 * robkit offers runs a script as `<manager> run <script>`.
 */
export async function packageManagerOf(root: string): Promise<string> {
  const { packageManager } = JSON.parse(
    await readFile(join(root, "package.json"), "utf8"),
  ) as { packageManager?: string };
  return /^([^@]+)@/.exec(packageManager ?? "")?.[1] ?? "pnpm";
}
