// The handover from robkit upgrade's first step to its second can't change
// once 0.1.0 is on npm: 0.1.0's first step runs every later robkit's
// second. So this runs the first step as upgrade-handover.ts has it, and
// the second as the robkit command has it now.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { parse, parseDocument } from "yaml";
import { defaultChoices } from "./choices.ts";
import { init } from "./init.ts";
import { readRobkitRepo } from "./robkit-repo.ts";
import { fakePnpm } from "./test/fake-pnpm.ts";
import { gitEnv } from "./test/git.ts";
import { newerVersion, robkitVersion } from "./test/robkit-version.ts";
import { handOver } from "./upgrade-handover.ts";

const run = promisify(execFile);

/**
 * The sha256 of upgrade-handover.ts, with LF endings. Until 0.1.0 is on
 * npm, a change to that file sets this to the hash the test names. After,
 * the file doesn't change: its first comment says what to do instead.
 */
const frozenHash =
  "ee2a43261b05a1d76f5aa4ef0a446297a01bc989919b4bace86c72dd41a97dcb";

describe("robkit upgrade's first step, as 0.1.0 ships it", () => {
  it("hands over to the current second step, which finishes the upgrade", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "robkit-")), "install");
    await init(defaultChoices, dir, { install: false });
    await writeFile(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    // The second step adds the entry back, and replaces the lint policy.
    const settingsPath = join(dir, "pnpm-workspace.yaml");
    const workspace = parseDocument(await readFile(settingsPath, "utf8"));
    workspace.deleteIn(["catalog", "express"]);
    await writeFile(settingsPath, workspace.toString());
    await writeFile(join(dir, "tooling/eslint/policy.js"), "// Older.\n");
    const env = await gitEnv(true);
    for (const args of [
      ["init", "--quiet"],
      ["add", "--all"],
      ["commit", "--quiet", "-m", "Make a robkit install"],
    ]) {
      await run("git", args, { cwd: dir, env });
    }
    const pnpm = await fakePnpm({ view: undefined }, env);

    await handOver(dir, { from: robkitVersion, to: newerVersion }, pnpm.env);

    expect(await pnpm.calls()).toEqual([
      ["install", "--no-frozen-lockfile"],
      ["exec", "robkit", "upgrade", "--finish", robkitVersion],
      ["install", "--no-frozen-lockfile"],
    ]);
    const repo = await readRobkitRepo();
    const settings = parse(await readFile(settingsPath, "utf8"), {
      schema: "failsafe",
    }) as { catalog: Record<string, string> };
    expect(settings.catalog).toMatchObject({
      "create-robkit": newerVersion,
      "@robkit/core": newerVersion,
      express: repo.catalog.get("express"),
    });
    expect(await readFile(join(dir, "tooling/eslint/policy.js"), "utf8")).toBe(
      repo.lintPolicy.get("policy.js"),
    );
  });

  it("is the file 0.1.0 ships", async () => {
    const text = await readFile(
      new URL("upgrade-handover.ts", import.meta.url),
      "utf8",
    );
    const hash = createHash("sha256")
      .update(text.replaceAll("\r\n", "\n"))
      .digest("hex");

    expect(
      hash,
      "upgrade-handover.ts changed. Once 0.1.0 is on npm it mustn't: its first comment says what to do instead. Before then, set frozenHash in this test to the new hash.",
    ).toBe(frozenHash);
  });
});
