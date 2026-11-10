import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** This process's environment without PATH, whatever its case. */
function withoutPath(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "PATH"),
  );
}

/**
 * This process's environment with PATH set to a new folder holding fake
 * commands, each of which prints its line and exits 0.
 */
export async function pathWith(
  commands: Record<string, string>,
): Promise<NodeJS.ProcessEnv> {
  const dir = await mkdtemp(join(tmpdir(), "robkit-path-"));
  for (const [name, line] of Object.entries(commands)) {
    if (process.platform === "win32") {
      await writeFile(join(dir, `${name}.cmd`), `@echo ${line}\r\n`);
    } else {
      const file = join(dir, name);
      await writeFile(file, `#!/bin/sh\necho ${line}\n`);
      await chmod(file, 0o755);
    }
  }
  return { ...withoutPath(), PATH: dir };
}
