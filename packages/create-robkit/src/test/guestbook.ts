import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultChoices } from "../choices.ts";
import { exportApp, sharedFolder } from "../export.ts";
import { importApp } from "../import.ts";
import { init } from "../init.ts";
import { readTree, writeTree, type Tree } from "../sharing.ts";

/** The sample app repo, which lives outside any install. */
export const guestbookDir = fileURLToPath(
  new URL("../../../../examples/guestbook/", import.meta.url),
);

/**
 * The sample as robkit export writes it from a fresh install of this robkit:
 * its own files imported, then exported again. Its `shared/` is left out of
 * the import, so the export copies this robkit's packages in afresh.
 */
export async function exportedGuestbook(): Promise<Tree> {
  const work = await mkdtemp(join(tmpdir(), "robkit-guestbook-"));
  try {
    const source = join(work, "source");
    const own = [...(await readTree(guestbookDir))].filter(
      ([path]) => !path.startsWith(`${sharedFolder}/`),
    );
    await writeTree(source, new Map(own));
    const install = join(work, "install");
    await init(defaultChoices, install);
    await importApp(install, source);
    const { dir } = await exportApp(install, "guestbook", {
      out: join(work, "guestbook"),
    });
    return await readTree(dir);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
