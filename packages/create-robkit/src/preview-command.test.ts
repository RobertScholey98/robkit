import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { drive } from "./test/drive.ts";

const bin = fileURLToPath(new URL("preview-command.ts", import.meta.url));

describe("pnpm preview-install", () => {
  it("refuses a stack robkit can't make", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "robkit-"));

    const { code, output } = await drive(bin, cwd, ["--stack", "go"]);

    expect(code).toBe(1);
    expect(output).toContain(
      "--stack go isn't an option. Choose from: start, react-hono.",
    );
  });

  it("refuses a folder in use that it didn't make", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "robkit-"));
    await writeFile(join(cwd, "notes.txt"), "mine\n");

    const { code, output } = await drive(bin, cwd, ["."]);

    expect(code).toBe(1);
    expect(output).toContain(
      `${cwd} has files, and no .robkit-preview.json to say pnpm preview-install made it.`,
    );
  });

  it("prints its usage for more than one folder", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "robkit-"));

    const { code, output } = await drive(bin, cwd, ["a", "b"]);

    expect(code).toBe(1);
    expect(output).toContain(
      "Usage: pnpm preview-install [folder] [--stack <name>]",
    );
  });
});
