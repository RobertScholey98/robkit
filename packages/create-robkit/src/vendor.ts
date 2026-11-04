import { exec as execCallback } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { readInstallChoices } from "./add.ts";
import type { Files } from "./generate.ts";
import { packageManagers } from "./package-managers.ts";

const exec = promisify(execCallback);

/** Where `vendorPackages` puts the tarballs, from the install's root. */
export const vendorDir = "vendor/robkit";

/**
 * Packs each robkit package an install links to into its `vendor/robkit`
 * folder, as `pnpm publish` would pack it, and points the install's
 * overrides at those tarballs. The install then builds without the
 * checkout, as a Docker build on a host must, before the packages are on
 * npm. Run the install's package manager afterwards to take them in.
 */
export async function vendorPackages(root: string): Promise<void> {
  const pm = packageManagers[(await readInstallChoices(root)).packageManager];
  const settings: Files = new Map(
    await Promise.all(
      pm.settingsFiles.map(
        async (path) =>
          [path, await readFile(join(root, path), "utf8")] as const,
      ),
    ),
  );
  const linked = Object.entries(pm.overridesIn(settings)).filter(([, spec]) =>
    spec.startsWith("link:"),
  );
  if (linked.length === 0) {
    throw new Error(
      "This install doesn't link to a robkit checkout, so there is nothing to vendor. Make it with --link.",
    );
  }

  const out = join(root, vendorDir);
  await mkdir(out, { recursive: true });
  const overrides: Record<string, string> = {};
  for (const [name, spec] of linked) {
    const dir = spec.slice("link:".length);
    // The checkout is robkit's own, which pnpm runs. A shell finds pnpm.cmd
    // on Windows. The commands are fixed strings.
    await exec("pnpm run build", { cwd: dir });
    const { stdout } = await exec(
      `pnpm pack --json --pack-destination "${out}"`,
      { cwd: dir },
    );
    const { filename } = JSON.parse(stdout) as { filename: string };
    overrides[name] = `file:${vendorDir}/${basename(filename)}`;
  }
  await pm.writeSettings(settings, { overrides });
  for (const [path, text] of settings) {
    await writeFile(join(root, path), text);
  }
}
