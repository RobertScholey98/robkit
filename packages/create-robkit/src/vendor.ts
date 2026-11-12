import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { CommandProblem, exec, isMissing } from "@robkit/dev/cli";
import { format } from "prettier";
import { isRecord } from "@robkit/input";
import { parseDocument } from "yaml";
import { readInstallChoices } from "./add.ts";
import { pnpmSettings } from "./generate.ts";
import {
  readGoModule,
  vendoredGoDir,
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

const linkProtocol = "link:";

/** How an override starts that names a tarball an earlier run packed. */
const packedPrefix = `file:${vendorDir}/`;

const notLinked =
  "This install doesn't link to a robkit checkout, so there is nothing to vendor. Make it with --link.";

/**
 * The robkit packages to pack for the install at `root` with `overrides`,
 * its pnpm overrides, the checkout to pack them from, and the folder there
 * to run pnpm in. With no `from`, it packs the packages the install links,
 * from the checkout it links to. With one, it packs from that folder, and
 * packs again what an earlier run packed.
 */
function whatToPack(
  root: string,
  overrides: Record<string, string>,
  from: string | undefined,
): { names: string[]; cwd: string; checkout: string } {
  const entries = Object.entries(overrides);
  const isLinked = ([, spec]: [string, string]) =>
    spec.startsWith(linkProtocol);
  const isPacked = ([, spec]: [string, string]) =>
    spec.startsWith(packedPrefix);
  if (from === undefined) {
    const linked = entries.filter(isLinked);
    const [first] = linked;
    if (first === undefined) {
      throw new CommandProblem(
        entries.some(isPacked)
          ? "This install runs the tarballs robkit vendor packed, and links to no robkit checkout. To pack them again from a checkout, run pnpm robkit vendor --from <checkout>."
          : notLinked,
      );
    }
    // Every linked package is in the robkit checkout, so pnpm run from any
    // of them finds the rest by name.
    const cwd = first[1].slice(linkProtocol.length);
    return {
      names: linked.map(([name]) => name),
      cwd,
      checkout: join(cwd, "..", ".."),
    };
  }
  const names = entries
    .filter((entry) => isLinked(entry) || isPacked(entry))
    .map(([name]) => name);
  if (names.length === 0) throw new CommandProblem(notLinked);
  const checkout = resolve(root, from);
  if (!existsSync(join(checkout, "packages"))) {
    throw new CommandProblem(
      `${checkout} has no packages folder, so it isn't a robkit checkout. Give --from the folder robkit is cloned into.`,
    );
  }
  return { names, cwd: checkout, checkout };
}

/**
 * Packs each robkit package an install links to, and each robkit package
 * those run on, into its `vendor/robkit` folder, as `pnpm publish` would
 * pack it, and points the install's overrides at those tarballs. An install
 * made before a package arrived behind another, as `@robkit/provision`
 * did behind `@robkit/core`, then asks npm for neither. For an install with
 * a Go app it copies robkit's Go module too, and from one with none it
 * removes a copy an earlier run left. The install then builds without the
 * checkout, as a Docker build on a host must, before the packages are on
 * npm. Run `pnpm install` afterwards to take them in. It changes the
 * install's settings last, so a run that fails before then can run again.
 *
 * With `from`, a robkit checkout's folder, it packs from there instead, and
 * packs again the packages an earlier run packed. That is how an install
 * with no link left takes a newer robkit. It then removes each tarball no
 * override names.
 */
export async function vendorPackages(
  root: string,
  { from }: { from?: string | undefined } = {},
): Promise<void> {
  // Refuses a folder that isn't an install.
  await readInstallChoices(root);
  const path = join(root, pnpmSettings);
  const workspace = parseDocument(await readFile(path, "utf8"));
  const settings: unknown = workspace.toJS();
  const overrides = isRecord(settings) ? stringsIn(settings.overrides) : {};
  const { names, cwd, checkout } = whatToPack(root, overrides, from);
  const unsafe = names.find((name) => !packageName.test(name));
  if (unsafe !== undefined) {
    throw new CommandProblem(
      `${JSON.stringify(unsafe)} in ${pnpmSettings}'s overrides isn't a package name. Fix it, or make the install again with --link.`,
    );
  }

  const out = join(root, vendorDir);
  await mkdir(out, { recursive: true });
  const goMods = await goModsIn(root);
  if (goMods.length > 0) {
    await copyGoModule(root, join(checkout, "go"));
  } else {
    await rm(join(root, vendoredGoDir), { recursive: true, force: true });
  }
  // `name...` picks the package and what it depends on, and
  // --filter-prod leaves out its dev dependencies.
  const filters = names.flatMap((name) => ["--filter-prod", `${name}...`]);
  // One pnpm builds them all, in dependency order, and one packs them,
  // rather than two pnpm processes a package. The build's output shows as
  // it runs, and a failure points to it.
  await exec("pnpm", ["--recursive", ...filters, "run", "build"], {
    cwd,
    env: process.env,
  });
  await exec(
    "pnpm",
    ["--recursive", ...filters, "pack", "--pack-destination", out],
    { cwd, env: process.env },
  );
  // pnpm packed what the filters pick: each named package and the robkit
  // packages it runs on.
  const { packages } = await readPackages(checkout);
  for (const name of withDependencies(names, packages)) {
    const file = tarballOf(name, packages.get(name)?.version);
    if (file === undefined || !existsSync(join(out, file))) {
      throw new CommandProblem(
        `pnpm pack wrote no tarball for ${name} in ${cwd}. Check that the install's overrides link to a robkit checkout with ${name} in it, then try again.`,
      );
    }
    workspace.setIn(["overrides", name], `${packedPrefix}${file}`);
  }
  await writeFile(
    path,
    await format(workspace.toString(), { filepath: pnpmSettings }),
  );
  // A checkout on a new version names its tarballs anew, and the old
  // version's would stay beside them.
  const now: unknown = workspace.toJS();
  const named = new Set(
    Object.values(isRecord(now) ? stringsIn(now.overrides) : {}),
  );
  for (const file of await readdir(out)) {
    if (file.endsWith(".tgz") && !named.has(`${packedPrefix}${file}`)) {
      await rm(join(out, file));
    }
  }
  for (const goMod of goMods) {
    const text = await readFile(goMod, "utf8");
    await writeFile(goMod, withGoModule(text, vendoredGoModule));
  }
}

/**
 * Copies robkit's Go module from `goDir`, in the checkout, to the install's
 * `vendor/robkit/go`, in place of any copy there, leaving out its tests and
 * its manifest.
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

/**
 * The go.mod of each Go app in the install at `root`. With none, the install
 * needs no copy of robkit's Go module: `robkit add` writes one with the
 * first Go app.
 */
async function goModsIn(root: string): Promise<string[]> {
  const apps = join(root, "apps");
  const entries = await readdir(apps, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(apps, entry.name, "go.mod"))
    .filter((goMod) => existsSync(goMod));
}
