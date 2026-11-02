import { execFile } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, inject, it } from "vitest";

const run = promisify(execFile);

describe("the default install", () => {
  // A failing script rejects with its output.
  it.each(["lint", "typecheck", "test", "format:check"])(
    "passes its own %s",
    async (script) => {
      await run("pnpm", ["run", script], { cwd: inject("installs").checks });
    },
  );

  it("fails lint when an app other than core imports @robkit/core", async () => {
    const dir = inject("installs").checks;
    const file = "apps/hub/src/reach-core.ts";
    await writeFile(join(dir, file), 'export * from "@robkit/core";\n');
    try {
      const lint = run("pnpm", ["exec", "eslint", file], { cwd: dir });

      // ESLint's formatter drops the message's last full stop.
      await expect(lint).rejects.toMatchObject({
        stdout: expect.stringContaining(
          "Layer rule: only apps/core imports @robkit/core. Code reaches core over HTTP only",
        ) as string,
      });
    } finally {
      await rm(join(dir, file));
    }
  });
});
