import {
  access,
  constants,
  mkdtemp,
  readdir,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { removeWhenGone } from "@internal/test-postgres";

async function executable(file: string): Promise<boolean> {
  return access(file, constants.X_OK).then(
    () => true,
    () => false,
  );
}

/** A folder of links to everything in `folder` but `bin`. */
async function without(folder: string, bin: string): Promise<string> {
  const links = await mkdtemp(join(tmpdir(), "robkit-bin-"));
  removeWhenGone({ path: links });
  const names = await readdir(folder);
  await Promise.all(
    names
      .filter((name) => name !== bin)
      .map((name) => symlink(join(folder, name), join(links, name))),
  );
  return links;
}

/**
 * This process's PATH with `bin` out of it, as on a machine that lacks it.
 * A folder that holds `bin` gives way to one of links to the rest of it,
 * since a CI runner keeps gofmt in the folder git is in.
 */
export async function pathWithout(bin: string): Promise<string> {
  const entries = (process.env.PATH ?? "").split(delimiter);
  const kept = await Promise.all(
    entries.map(async (entry) =>
      (await executable(join(entry, bin))) ? without(entry, bin) : entry,
    ),
  );
  return kept.join(delimiter);
}

/**
 * A PATH that can't see any `node_modules/.bin`, with pnpm put back on it.
 * An install's scripts then find only the bins its own manifests give it,
 * as on the owner's machine: robkit's own `robkit` and `robkit-dev` bins
 * can't stand in for ones the install failed to link.
 */
export async function cleanPath(
  path = process.env.PATH ?? "",
): Promise<string> {
  const entries = path.split(delimiter);
  let pnpm: string | undefined;
  for (const entry of entries) {
    if (await executable(join(entry, "pnpm"))) {
      pnpm = join(entry, "pnpm");
      break;
    }
  }
  if (pnpm === undefined) {
    throw new Error(
      `pnpm isn't in any of the PATH's ${String(entries.length)} folders. Run corepack enable, then the tests again.`,
    );
  }
  const bin = await mkdtemp(join(tmpdir(), "robkit-bin-"));
  removeWhenGone({ path: bin });
  await writeFile(join(bin, "pnpm"), `#!/bin/sh\nexec '${pnpm}' "$@"\n`, {
    mode: 0o755,
  });
  return [
    bin,
    ...entries.filter(
      (entry) => !entry.replaceAll("\\", "/").includes("node_modules/.bin"),
    ),
  ].join(delimiter);
}
