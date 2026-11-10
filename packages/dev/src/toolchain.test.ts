import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { requireGo } from "./toolchain.ts";
import { CommandProblem } from "@robkit/input/command";

/** An environment whose PATH is an empty folder, so no `go` is on it. */
async function withoutGo(): Promise<NodeJS.ProcessEnv> {
  const empty = await mkdtemp(join(tmpdir(), "no-go-"));
  return { ...process.env, PATH: empty, Path: empty };
}

describe("requireGo", () => {
  it("passes when go is on the PATH", async () => {
    await expect(requireGo(process.env)).resolves.toBeUndefined();
  });

  it("says how to install Go when it isn't", async () => {
    const checking = requireGo(await withoutGo());

    await expect(checking).rejects.toThrow(CommandProblem);
    await expect(checking).rejects.toThrow(
      "Go isn't installed, or isn't on your PATH, and this install's React + Go apps build and run with it. Install Go 1.26 or later from https://go.dev/dl/, open a new terminal, then try again.",
    );
  });
});
