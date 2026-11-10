import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CommandProblem, exec, isMissing } from "@robkit/dev/cli";
import { format } from "prettier";
import { isRecord } from "@robkit/input";
import { parseDocument } from "yaml";
import { readInstallChoices } from "./add.ts";
import { pnpmSettings } from "./generate.ts";
import {
  readGoModule,
  vendoredGoModule,
  withGoModule,
  writeGoModule,
} from "./go-module.ts";
import { stringsIn } from "./json.ts";
import { readPackages, withDependencies } from "./robkit-repo.ts";

/** An npm package's name, such as `@robkit/session`. */
const packageName = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/;

/**
 * The file `pnpm pack` names a package's tarball, such as
 * `robkit-core-0.1.0.tgz`, or nothing for a package with no version.
 */
function tarballOf(name: string, version: string | undefined) {
  if (version === undefined) return undefined;
  return `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;
}

/** Where `vendorPackages` puts the tarballs, from the install's root. */
export const vendorDir = "vendor/robkit";

/**
 * Packs each robkit package an install links to, and each robkit package
 * those run on, into its `vendor/robkit` folder, as `pnpm publish` would
 * pack it, and points the install's overrides at those tarballs. An install
 * made before a package arrived behind another, as `@robkit/provision`
 * did behind `@robkit/core`, then asks npm for neither. It copies robkit's
 * Go module too. The install then builds without the checkout, as a Docker
 * build on a host must, before the packages are on npm. Run `pnpm install`
 * afterwards to take them in. It changes the install's settings last, so a
 * run that fails before then can run again.
 */
export async function vendorPackages(root: string): Promise<void> {
  // Refuses a folder that isn't an install.
  await readInstallChoices(root);
  const path = join(root, pnpmSettings);
  const workspace = parseDocument(await readFile(path, "utf8"));
  const settings: unknown = workspace.toJS();
  const overrides = isRecord(settings) ? stringsIn(settings.overrides) : {};
  const protocol = "link:";
  const linked = Object.entries(overrides).filter(([, spec]) =>
    spec.startsWith(protocol),
  );
  const [first] = linked;
  if (first === undefined) {
    throw new CommandProblem(
      "This install doesn't link to a robkit checkout, so there is nothing to vendor. Make it with --link.",
    );
  }

  const names = linked.map(([name]) => name);
  const unsafe = names.find((name) => !packageName.test(name));
  if (unsafe !== undefined) {
    throw new CommandProblem(
      `${JSON.stringify(unsafe)} in ${pnpmSettings}'s overrides isn't a package name. Fix it, or make the install again with --link.`,
    );
  }

  const out = join(root, vendorDir);
  await mkdir(out, { recursive: true });
  // Every linked package is in the robkit checkout, so pnpm run from any of
  // them finds the rest by name. One pnpm builds them all, in dependency
  // order, and one packs them, rather than two pnpm processes a package.
  const cwd = first[1].slice(protocol.length);
  await copyGoModule(root, join(cwd, "..", "..", "go"));
  // `name...` picks the package and what it depends on, and
  // --filter-prod leaves out its dev dependencies.
  const filters = names.flatMap((name) => ["--filter-prod", `${name}...`]);
  // The build's output shows as it runs, and a failure points to it.
  await exec("pnpm", ["--recursive", ...filters, "run", "build"], {
    cwd,
    env: process.env,
  });
  await exec(
    "pnpm",
    ["--recursive", ...filters, "pack", "--pack-destination", out],
    { cwd, env: process.env },
  );
  // pnpm packed what the filters pick: each linked package and the robkit
  // packages it runs on.
  const { packages } = await readPackages(join(cwd, "..", ".."));
  for (const name of withDependencies(names, packages)) {
    const file = tarballOf(name, packages.get(name)?.version);
    if (file === undefined || !existsSync(join(out, file))) {
      throw new CommandProblem(
        `pnpm pack wrote no tarball for ${name} in ${cwd}. Check that the install's overrides link to a robkit checkout with ${name} in it, then try again.`,
      );
    }
    workspace.setIn(["overrides", name], `file:${vendorDir}/${file}`);
  }
  await writeFile(
    path,
    await format(workspace.toString(), { filepath: pnpmSettings }),
  );
  await pointGoAppsAtCopy(root);
}

/**
 * Copies robkit's Go module from `goDir`, in the checkout, to the install's
 * `vendor/robkit/go`, in place of any copy there, leaving out its tests and
 * its manifest. It copies the module whether or not an app needs it yet, so
 * `robkit add --stack go` works after vendoring.
 */
async function copyGoModule(root: string, goDir: string): Promise<void> {
  const goModule = await readGoModule(goDir).catch((error: unknown) => {
    if (!isMissing(error)) throw error;
    throw new CommandProblem(
      `${goDir} doesn't exist, so robkit vendor can't copy robkit's Go module from the checkout. Check that the install's overrides link to a robkit checkout, then try again.`,
      { cause: error },
    );
  });
  await writeGoModule(root, goModule);
}

/** Points each Go app's go.mod at the install's copy of robkit's Go module. */
async function pointGoAppsAtCopy(root: string): Promise<void> {
  const apps = join(root, "apps");
  for (const entry of await readdir(apps, { withFileTypes: true })) {
    const goMod = join(apps, entry.name, "go.mod");
    if (!entry.isDirectory() || !existsSync(goMod)) continue;
    const text = await readFile(goMod, "utf8");
    await writeFile(goMod, withGoModule(text, vendoredGoModule));
  }
}
