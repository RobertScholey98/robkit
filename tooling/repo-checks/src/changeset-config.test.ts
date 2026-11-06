// Which changes `.changeset/config.json` says need a changeset, checked by
// running `changeset status` as CI does, on a scratch repo with the same
// config and create-robkit's layout.
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../../..");
const changeset = join(root, "node_modules/@changesets/cli/bin.js");
const createRobkit = "packages/create-robkit";

let repo: string;

function git(...args: string[]): void {
  execFileSync("git", args, { cwd: repo, stdio: "ignore" });
}

async function write(path: string, text: string) {
  await mkdir(join(repo, path, ".."), { recursive: true });
  await writeFile(join(repo, path), text);
}

/** Whether CI's `changeset status` passes a branch that changes `path`. */
async function passesWithout(path: string): Promise<boolean> {
  git("checkout", "-q", "-b", "change");
  await write(join(createRobkit, path), "export const changed = true;\n");
  git("commit", "-q", "--no-verify", "-am", "Change it");
  const { status } = spawnSync(
    process.execPath,
    [changeset, "status", "--since=main"],
    { cwd: repo, encoding: "utf8" },
  );
  return status === 0;
}

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "changeset-config-"));
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  await write("package.json", '{ "name": "root", "private": true }\n');
  await write("pnpm-workspace.yaml", "packages:\n  - packages/*\n");
  await mkdir(join(repo, ".changeset"));
  await copyFile(
    join(root, ".changeset/config.json"),
    join(repo, ".changeset/config.json"),
  );
  await write(
    join(createRobkit, "package.json"),
    '{ "name": "create-robkit", "version": "0.0.0" }\n',
  );
  for (const path of [
    "src/index.ts",
    "src/index.test.ts",
    "templates/base/apps/hub/src/app.ts",
    "templates/base/apps/hub/src/app.test.ts",
    "templates/base/compose.yaml",
  ]) {
    await write(join(createRobkit, path), "export const changed = false;\n");
  }
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "Start");
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe(".changeset/config.json", () => {
  it.each([
    "src/index.ts",
    "templates/base/apps/hub/src/app.ts",
    "templates/base/compose.yaml",
  ])("needs a changeset for a change to %s", async (path) => {
    expect(await passesWithout(path)).toBe(false);
  });

  it.each(["src/index.test.ts", "templates/base/apps/hub/src/app.test.ts"])(
    "needs none for a change to the test %s",
    async (path) => {
      expect(await passesWithout(path)).toBe(true);
    },
  );
});
