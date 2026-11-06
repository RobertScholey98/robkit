import { exec as execCallback } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { CommandProblem } from "@robkit/dev/cli";
import { format } from "prettier";
import { isProblem, isRecord, parseJson } from "@robkit/input";
import { parseDocument } from "yaml";
import { readInstallChoices } from "./add.ts";
import { pnpmSettings } from "./generate.ts";
import { stringsIn } from "./json.ts";

const exec = promisify(execCallback);

/** An npm package's name, such as `@robkit/session`. */
const packageName = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/;

/** Each tarball `pnpm pack --recursive --json` wrote, by package name. */
function tarballsIn(stdout: string): Map<string, string> {
  const parsed = parseJson(stdout, "pnpm pack --json");
  if (isProblem(parsed)) throw new Error(parsed.error);
  const packed = Array.isArray(parsed.json) ? parsed.json : [];
  return new Map(
    packed
      .map(stringsIn)
      .flatMap(({ name, filename }) =>
        name !== undefined && filename !== undefined ? [[name, filename]] : [],
      ),
  );
}

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
  // A shell finds pnpm.cmd on Windows; the names are checked above.
  const cwd = first[1].slice(protocol.length);
  const filters = names.map((name) => `--filter ${name}`).join(" ");
  await exec(`pnpm --recursive ${filters} run build`, { cwd });
  const { stdout } = await exec(
    `pnpm --recursive ${filters} pack --json --pack-destination "${out}"`,
    { cwd },
  );
  const tarballs = tarballsIn(stdout);
  for (const name of names) {
    const filename = tarballs.get(name);
    if (filename === undefined) {
      throw new Error(`pnpm pack --json printed no tarball for ${name}.`);
    }
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
