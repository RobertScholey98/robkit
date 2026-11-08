import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runDev } from "./runner.ts";

// The runner's journeys start Postgres, so they are in runner.db.test.ts.
// This checks what it refuses before starting anything.
describe("runDev", () => {
  it("says how to install Go, starting nothing, when an app has a go.mod and go isn't on the PATH", async () => {
    const root = await mkdtemp(join(tmpdir(), "robkit-dev-"));
    await mkdir(join(root, "apps/notes"), { recursive: true });
    await writeFile(
      join(root, "apps/notes/package.json"),
      JSON.stringify({ scripts: { dev: "go run . dev" } }),
    );
    await writeFile(join(root, "apps/notes/go.mod"), "module app\n");
    const empty = await mkdtemp(join(tmpdir(), "no-go-"));

    const running = runDev(root, { ...process.env, PATH: empty, Path: empty });

    await expect(running).rejects.toThrow(
      "Go isn't installed, or isn't on your PATH",
    );
  });
});
