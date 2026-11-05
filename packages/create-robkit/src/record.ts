import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Choices } from "./choices.ts";

/**
 * Where an app repo comes from: the remote or path it was installed from or
 * last shared to, and the commit the install runs. An app never shared has
 * neither.
 */
export interface AppSource {
  source?: string;
  revision?: string;
}

/**
 * `robkit.json`: init's choices, and each app repo in the install, by slug.
 * The install's own repository ignores its app repos, so this is how a
 * clone of it, or a deploy, finds them again.
 */
export interface InstallRecord extends Choices {
  apps?: Record<string, AppSource>;
}

const recordFile = "robkit.json";

/** The install's `robkit.json`, refusing a folder that has none. */
export async function readInstallRecord(root: string): Promise<InstallRecord> {
  let text: string;
  try {
    text = await readFile(join(root, recordFile), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    throw new Error(
      `${root} has no robkit.json. Run robkit add in an install's folder.`,
      { cause: error },
    );
  }
  return JSON.parse(text) as InstallRecord;
}
