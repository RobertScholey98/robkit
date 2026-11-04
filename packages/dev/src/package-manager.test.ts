import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { packageManagerOf } from "./package-manager.ts";

async function installWith(manifest: object): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "robkit-pm-"));
  await writeFile(join(root, "package.json"), JSON.stringify(manifest));
  return root;
}

describe("packageManagerOf", () => {
  it.each([
    ["pnpm@11.28.9", "pnpm"],
    ["bun@1.4.4", "bun"],
  ])("runs an install whose manifest names %s with %s", async (spec, pm) => {
    const root = await installWith({ packageManager: spec });

    expect(await packageManagerOf(root)).toBe(pm);
  });

  it("runs an install whose manifest names no manager with pnpm", async () => {
    const root = await installWith({ private: true });

    expect(await packageManagerOf(root)).toBe("pnpm");
  });
});
