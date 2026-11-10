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
import { describe, expect, it, vi } from "vitest";
import { parse, parseDocument } from "yaml";
import { defaultChoices } from "./choices.ts";
import { init } from "./init.ts";
import { readRobkitRepo } from "./robkit-repo.ts";
import { fakePnpm } from "./test/fake-pnpm.ts";
import { gitEnv } from "./test/git.ts";
import { robkitVersion } from "./test/robkit-version.ts";
import { handOver } from "./upgrade-handover.ts";

const run = promisify(execFile);

/** A version before this checkout's, which semver orders as a prerelease of it. */
const older = `${robkitVersion}-0`;

// Each test writes and commits an install, and most run robkit and a fake
// pnpm as child processes: 2 to 6 seconds alone, and several times that
// under a loaded gate on Windows.
vi.setConfig({ testTimeout: 120_000 });

/**
 * The sha256 of upgrade-handover.ts, with LF endings. Until 0.1.0 is on
 * npm, a change to that file sets this to the hash the test names. After,
 * the file doesn't change: its first comment says what to do instead.
 */
const frozenHash =
  "b73e992e7d47a497ce31292b84785e5795767e1edeb0ae9b683098a72ee15f18";

describe("robkit upgrade's first step, as 0.1.0 ships it", () => {
  it("hands over to the current second step, which finishes the upgrade", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "robkit-")), "install");
    await init(defaultChoices, dir, { install: false });
    await writeFile(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    // The second step here is this checkout's, so the install it moves is
    // on a version before it. It raises core's entry, adds express back,
    // and replaces the lint policy.
    const settingsPath = join(dir, "pnpm-workspace.yaml");
    const workspace = parseDocument(await readFile(settingsPath, "utf8"));
    workspace.setIn(["catalog", "create-robkit"], older);
    workspace.setIn(["catalog", "@robkit/core"], older);
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

    await handOver(dir, { from: older, to: robkitVersion }, pnpm.env);

    expect(await pnpm.calls()).toEqual([
      ["install", "--no-frozen-lockfile"],
      ["exec", "robkit", "upgrade", "--finish", older],
      ["install", "--no-frozen-lockfile"],
    ]);
    const repo = await readRobkitRepo();
    const settings = parse(await readFile(settingsPath, "utf8"), {
      schema: "failsafe",
    }) as { catalog: Record<string, string> };
    expect(settings.catalog).toMatchObject({
      "create-robkit": robkitVersion,
      "@robkit/core": robkitVersion,
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
