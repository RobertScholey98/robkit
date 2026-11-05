import { exec as execCallback } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { format } from "prettier";
import { parseDocument } from "yaml";
import { readInstallChoices } from "./add.ts";
import { pnpmSettings } from "./generate.ts";

const exec = promisify(execCallback);

/** Where `vendorPackages` puts the tarballs, from the install's root. */
export const vendorDir = "vendor/robkit";

/**
 * Packs each robkit package an install links to into its `vendor/robkit`
 * folder, as `pnpm publish` would pack it, and points the install's
 * overrides at those tarballs. The install then builds without the
 * checkout, as a Docker build on a host must, before the packages are on
 * npm. Run `pnpm install` afterwards to take them in.
 */
export async function vendorPackages(root: string): Promise<void> {
  // Refuses a folder that isn't an install.
  await readInstallChoices(root);
  const path = join(root, pnpmSettings);
  const workspace = parseDocument(await readFile(path, "utf8"));
  const { overrides = {} } = workspace.toJS() as {
    overrides?: Record<string, string>;
  };
  const protocol = "link:";
  const linked = Object.entries(overrides).filter(([, spec]) =>
    spec.startsWith(protocol),
  );
  if (linked.length === 0) {
    throw new Error(
      "This install doesn't link to a robkit checkout, so there is nothing to vendor. Make it with --link.",
    );
  }

  const out = join(root, vendorDir);
  await mkdir(out, { recursive: true });
  for (const [name, spec] of linked) {
    const dir = spec.slice(protocol.length);
    // The checkout is robkit's own, which pnpm runs. A shell finds pnpm.cmd
    // on Windows. The commands are fixed strings.
    await exec("pnpm run build", { cwd: dir });
    const { stdout } = await exec(
      `pnpm pack --json --pack-destination "${out}"`,
      { cwd: dir },
    );
    const { filename } = JSON.parse(stdout) as { filename: string };
    workspace.setIn(
      ["overrides", name],
      `file:${vendorDir}/${basename(filename)}`,
    );
  }
  await writeFile(
    path,
    await format(workspace.toString(), { filepath: pnpmSettings }),
  );
}
