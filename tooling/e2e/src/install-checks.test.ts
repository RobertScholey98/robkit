import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, inject, it } from "vitest";

const run = promisify(execFile);

describe("the default install", () => {
  // A failing script rejects with its output.
  it.each(["lint", "typecheck", "test", "format:check"])(
    "passes its own %s",
    async (script) => {
      await run("pnpm", ["run", script], { cwd: inject("installs").checks });
    },
  );
});
