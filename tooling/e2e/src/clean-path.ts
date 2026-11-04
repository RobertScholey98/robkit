import { access, constants, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

async function executable(file: string): Promise<boolean> {
  return access(file, constants.X_OK).then(
    () => true,
    () => false,
  );
}

/**
 * A PATH that can't see any `node_modules/.bin`, with the package manager
 * `command` (and its `<command>x`, if it has one) put back on it. An
 * install's scripts then find only the bins its own manifests give it, as
 * on the owner's machine: robkit's own `robkit` and `robkit-dev` bins
 * can't stand in for ones the install failed to link.
 */
export async function cleanPath(
  command: string,
  path = process.env.PATH ?? "",
): Promise<string> {
  const entries = path.split(delimiter);
  const bin = await mkdtemp(join(tmpdir(), "robkit-bin-"));
  for (const name of [command, `${command}x`]) {
    let found: string | undefined;
    for (const entry of entries) {
      if (await executable(join(entry, name))) {
        found = join(entry, name);
        break;
      }
    }
    if (found === undefined) {
      if (name === command) throw new Error(`${command} isn't on the PATH`);
      continue;
    }
    await writeFile(join(bin, name), `#!/bin/sh\nexec '${found}' "$@"\n`, {
      mode: 0o755,
    });
  }
  return [
    bin,
    ...entries.filter(
      (entry) => !entry.replaceAll("\\", "/").includes("node_modules/.bin"),
    ),
  ].join(delimiter);
}
