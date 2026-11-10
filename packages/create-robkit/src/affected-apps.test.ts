import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CommandProblem } from "@robkit/dev/cli";
import { affectedApps } from "./affected-apps.ts";

/**
 * The environment with a stand-in turbo first on the PATH, which runs
 * `script`.
 */
async function withTurbo(script: string): Promise<NodeJS.ProcessEnv> {
  const standIn = await mkdtemp(join(tmpdir(), "turbo-stand-in-"));
  await writeFile(join(standIn, "turbo"), `#!/bin/sh\n${script}\n`, {
    mode: 0o755,
  });
  return { ...process.env, PATH: `${standIn}:${String(process.env.PATH)}` };
}

// The stand-in turbo is a shell script, which Windows can't run.
describe.skipIf(process.platform === "win32")("affectedApps", () => {
  it("reads the apps turbo ls found changed", async () => {
    const env = await withTurbo(
      `echo '{"packages":{"items":[{"path":"apps/notes"},{"path":"packages/ui"}]}}'`,
    );

    expect(await affectedApps(tmpdir(), env)).toEqual(["notes"]);
  });

  it("throws turbo's own message as a problem when turbo ls fails", async () => {
    const env = await withTurbo(
      "echo '  x No git repository found.' >&2\nexit 1",
    );

    const found = affectedApps(tmpdir(), env);

    await expect(found).rejects.toBeInstanceOf(CommandProblem);
    await expect(found).rejects.toThrow(
      "turbo ls --affected couldn't find the apps that changed: x No git repository found. Name the apps to deploy with --apps, or deploy them all with --all.",
    );
  });
});
