import { execFile } from "node:child_process";
import { cp } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

const sample = fileURLToPath(
  new URL("../../../examples/guestbook", import.meta.url),
);

/** A committer for the repos the tests make, where git may have none. */
export const identity = [
  "-c",
  "user.name=R",
  "-c",
  "user.email=r@robkit.localhost",
];

/**
 * Makes the sample guestbook its own git repo at `<parent>/guestbook`,
 * outside any install, as an app another owner shared would be.
 */
export async function sampleAppRepo(parent: string): Promise<string> {
  const dir = join(parent, "guestbook");
  await cp(sample, dir, { recursive: true });
  await run("git", ["init", "--quiet", "--initial-branch=main"], { cwd: dir });
  await run("git", ["add", "."], { cwd: dir });
  await run("git", [...identity, "commit", "--quiet", "-m", "Guestbook"], {
    cwd: dir,
  });
  return dir;
}
