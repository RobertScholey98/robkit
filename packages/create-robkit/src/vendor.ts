import { exec as execCallback } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { CommandProblem, exec } from "@robkit/dev/cli";
import { format } from "prettier";
import { isProblem, isRecord, parseJson } from "@robkit/input";
import { parseDocument } from "yaml";
import { readInstallChoices } from "./add.ts";
import { pnpmSettings } from "./generate.ts";
import { stringsIn } from "./json.ts";

const shell = promisify(execCallback);

/**
 * What `command` printed, run through a shell in `cwd`. If it fails, throws
 * a {@link CommandProblem} naming it, the folder, its exit code and what it
 * printed.
 */
async function printed(command: string, cwd: string): Promise<string> {
  try {
    return (await shell(command, { cwd })).stdout;
  } catch (error) {
    // A command that couldn't start has a string code; that is a fault.
    if (!isRecord(error) || typeof error.code !== "number") throw error;
    const output = [error.stdout, error.stderr]
      .filter((text) => typeof text === "string")
      .join("\n")
      .trim();
    throw new CommandProblem(
      `${command} exited with ${String(error.code)} in ${cwd}. It printed:\n${output}\nFix what it says, then try again.`,
      { cause: error },
    );
  }
}

/** An npm package's name, such as `@robkit/session`. */
const packageName = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/;

/**
 * Each tarball `pnpm pack --recursive --json` wrote in `cwd`, by package
 * name. It prints a list, one package alone, or nothing if it packed none.
 */
function tarballsIn(stdout: string, cwd: string): Map<string, string> {
  if (stdout.trim() === "") return new Map();
  const parsed = parseJson(stdout, "pnpm pack --json");
  if (isProblem(parsed)) {
    throw new CommandProblem(
      `pnpm pack --json printed something that isn't JSON in ${cwd}, so robkit can't find its tarballs. Check that pnpm there is the version robkit's package.json names, then try again.`,
    );
  }
  const packed: unknown[] = Array.isArray(parsed.json)
    ? parsed.json
    : [parsed.json];
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
  const cwd = first[1].slice(protocol.length);
  const filters = names.flatMap((name) => ["--filter", name]);
  // The build's output shows as it runs, and a failure points to it.
  await exec("pnpm", ["--recursive", ...filters, "run", "build"], {
    cwd,
    env: process.env,
  });
  // A shell finds pnpm.cmd on Windows; the names are checked above.
  const tarballs = tarballsIn(
    await printed(
      `pnpm --recursive ${filters.join(" ")} pack --json --pack-destination "${out}"`,
      cwd,
    ),
    cwd,
  );
  for (const name of names) {
    const filename = tarballs.get(name);
    if (filename === undefined) {
      throw new CommandProblem(
        `pnpm pack wrote no tarball for ${name} in ${cwd}. Check that the install's overrides link to a robkit checkout with ${name} in it, then try again.`,
      );
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
