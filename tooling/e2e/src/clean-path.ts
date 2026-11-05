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
  if (pnpm === undefined) throw new Error("pnpm isn't on the PATH");
  const bin = await mkdtemp(join(tmpdir(), "robkit-bin-"));
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
