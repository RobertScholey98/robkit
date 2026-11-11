// What every package's tests run with, from @internal/vitest-config: no git
// identity of the machine's own, and time for a poll on a slow machine.
import { execFileSync, spawnSync } from "node:child_process";
import { globSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vitestConfigs } from "./coverage-thresholds.ts";

const root = join(import.meta.dirname, "../../..");

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "test-defaults-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("a test that runs git", () => {
  it("can't commit without setting an identity, even where the machine has one", async () => {
    // A home whose global config has a name and email, as a laptop's does.
    await writeFile(
      join(dir, ".gitconfig"),
      "[user]\n\tname = Someone\n\temail = someone@example.com\n",
    );
    const env = { ...process.env, HOME: dir, USERPROFILE: dir };
    const repo = join(dir, "repo");
    execFileSync("git", ["init", "-q", repo]);

    const commit = spawnSync(
      "git",
      ["commit", "-q", "--allow-empty", "--no-verify", "-m", "Start"],
      { cwd: repo, env, encoding: "utf8" },
    );

    expect(commit.status).not.toBe(0);
    expect(commit.stderr).toContain("Author identity unknown");
  });

  it("commits once its own clone has one", () => {
    execFileSync("git", ["init", "-q", dir]);
    execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: dir,
    });

    const commit = spawnSync(
      "git",
      ["commit", "-q", "--allow-empty", "--no-verify", "-m", "Start"],
      { cwd: dir },
    );

    expect(commit.status).toBe(0);
  });
});

it("gives expect.poll time for what a slow machine takes", async () => {
  const start = Date.now();

  await expect
    .poll(() => Date.now() - start >= 3_000, { interval: 100 })
    .toBe(true);
});

it("reach every package's tests", () => {
  const missing = globSync(vitestConfigs, { cwd: root })
    .map((path) => path.replaceAll("\\", "/"))
    .filter((path) => {
      const config = readFileSync(join(root, path), "utf8");
      return (
        !config.includes('from "@internal/vitest-config"') ||
        !config.includes("...testDefaults,")
      );
    })
    .map(
      (path) =>
        `${path} doesn't run its tests with robkit's defaults. Import testDefaults from @internal/vitest-config and put ...testDefaults first in its test config.`,
    );

  expect(missing).toEqual([]);
});
