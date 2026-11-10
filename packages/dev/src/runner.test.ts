import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { runDev } from "./runner.ts";

const bin = fileURLToPath(new URL("robkit-dev-command.ts", import.meta.url));

/** An install with no apps: a folder with a robkit.json. */
async function emptyInstall(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "robkit-dev-"));
  await writeFile(join(root, "robkit.json"), "{}\n");
  return root;
}

// The runner's journeys start Postgres, so they are in runner.db.test.ts.
// This checks what it refuses before starting anything.
describe("runDev", () => {
  it("says how to install Go, starting nothing, when an app has a go.mod and go isn't on the PATH", async () => {
    const root = await emptyInstall();
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

  it("refuses a folder with no robkit.json, in this process too", async () => {
    const folder = await mkdtemp(join(tmpdir(), "not-an-install-"));

    await expect(runDev(folder, process.env)).rejects.toThrow(
      `${folder} isn't a robkit install: it has no robkit.json. Run pnpm dev in an install's folder.`,
    );
  });

  it("exits 1, starting nothing, when a setting won't do", async () => {
    const root = await emptyInstall();
    const printed: unknown[] = [];
    const error = vi.spyOn(console, "error").mockImplementation((line) => {
      printed.push(line);
    });
    onTestFinished(() => {
      error.mockRestore();
    });

    expect(await runDev(root, { ROBKIT_DEV_PORT: "nope" })).toBe(1);
    expect(printed).toEqual([expect.stringContaining("ROBKIT_DEV_PORT")]);
  });

  it("prints one line saying so when run outside an install", async () => {
    const folder = await mkdtemp(join(tmpdir(), "not-an-install-"));

    const child = spawn(process.execPath, [bin], {
      cwd: folder,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    const [code] = (await once(child, "close")) as [number];

    expect({ code, output }).toEqual({
      code: 1,
      output: `${folder} isn't a robkit install: it has no robkit.json. Run pnpm dev in an install's folder.\n`,
    });
  });
});
