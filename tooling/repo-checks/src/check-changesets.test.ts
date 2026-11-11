// The changeset check CI runs, check-changesets.ts, on a scratch repo with
// this repo's `.changeset/config.json` and the layout of three published
// packages: which changes need a changeset, and which package it must name.
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../../..");
const script = join(import.meta.dirname, "check-changesets.ts");

/** Each scratch package's name, by its folder. */
const packages = {
  "packages/create-robkit": "create-robkit",
  "packages/core": "@robkit/core",
  "packages/input": "@robkit/input",
  "packages/guard": "@robkit/guard",
};

/** A package.json for the package `name`, with `extra` fields. */
const manifest = (name: string, version = "0.0.0", extra = "") =>
  `{ "name": "${name}", "version": "${version}"${extra} }\n`;

let repo: string;

function git(...args: string[]): void {
  execFileSync("git", args, { cwd: repo, stdio: "ignore" });
}

async function write(path: string, text: string) {
  await mkdir(join(repo, path, ".."), { recursive: true });
  await writeFile(join(repo, path), text);
}

/** Commits a change to each of `paths` on the branch. */
async function change(...paths: string[]) {
  for (const path of paths) await write(path, "export const changed = true;\n");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "Change it");
}

/** Adds a changeset that names each of `names`. */
async function changeset(id: string, ...names: string[]) {
  const releases = names.map((name) => `"${name}": patch\n`).join("");
  await write(`.changeset/${id}.md`, `---\n${releases}---\n\nSay what.\n`);
}

function check(...args: string[]) {
  const { status, stdout, stderr } = spawnSync(
    process.execPath,
    [script, ...args],
    { cwd: repo, encoding: "utf8" },
  );
  return { status, output: stdout + stderr };
}

const unnamed = (name: string) =>
  `${name} changed, but no changeset in this branch names it. Run pnpm changeset, pick ${name} and say what changed for its changelog.\n`;

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "check-changesets-"));
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
  for (const [dir, name] of Object.entries(packages)) {
    await write(`${dir}/package.json`, manifest(name));
  }
  await write(
    "packages/private/package.json",
    '{ "name": "@internal/private", "version": "0.0.0", "private": true }\n',
  );
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "Start");
  git("checkout", "-q", "-b", "change");
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe("which changes need a changeset", () => {
  it.each([
    "packages/create-robkit/src/index.ts",
    "packages/create-robkit/templates/base/apps/hub/src/app.ts",
    "packages/create-robkit/templates/base/compose.yaml",
  ])("needs one for a change to %s", async (path) => {
    await change(path);

    expect(check("main").status).toBe(1);
  });

  it.each([
    "packages/create-robkit/src/index.test.ts",
    "packages/create-robkit/src/test/fake.ts",
    "packages/create-robkit/templates/base/apps/hub/src/app.test.ts",
    "packages/private/src/index.ts",
    "packages/core/src/session.test.ts",
    "README.md",
  ])("needs none for a change to %s", async (path) => {
    await change(path);

    expect(check("main")).toEqual({ status: 0, output: "" });
  });

  it.each([
    "packages/guard/conformance.json",
    "packages/core/drizzle/0001_add_codes.sql",
    "packages/core/drizzle/meta/_journal.json",
  ])("needs one for a change to %s", async (path) => {
    await write(path, "{}\n");
    git("add", "-A");
    git("commit", "-q", "--no-verify", "-m", "Change it");

    expect(check("main").status).toBe(1);
  });

  it("needs one for a change to a package's package.json", async () => {
    await write(
      "packages/core/package.json",
      manifest("@robkit/core", "0.0.0", ', "bin": "core.js"'),
    );
    git("commit", "-q", "--no-verify", "-am", "Add a bin");

    expect(check("main")).toEqual({
      status: 1,
      output: unnamed("@robkit/core"),
    });
  });

  it("needs none in the version pull request, which bumps each version", async () => {
    git("checkout", "-q", "main");
    await changeset("earlier", "@robkit/core");
    git("add", "-A");
    git("commit", "-q", "--no-verify", "-m", "Add a changeset");
    git("checkout", "-q", "-B", "release-v0.1.0");
    await rm(join(repo, ".changeset/earlier.md"));
    for (const [dir, name] of Object.entries(packages)) {
      await write(`${dir}/package.json`, manifest(name, "0.1.0"));
      await write(`${dir}/CHANGELOG.md`, "# Changelog\n");
    }
    git("add", "-A");
    git("commit", "-q", "--no-verify", "-m", "Version packages as 0.1.0");

    expect(check("main")).toEqual({ status: 0, output: "" });
  });

  it("still needs one for a source change someone adds to the version pull request", async () => {
    git("checkout", "-q", "-B", "release-v0.1.0");
    for (const [dir, name] of Object.entries(packages)) {
      await write(`${dir}/package.json`, manifest(name, "0.1.0"));
      await write(`${dir}/CHANGELOG.md`, "# Changelog\n");
    }
    git("add", "-A");
    git("commit", "-q", "--no-verify", "-m", "Version packages as 0.1.0");
    await change(
      "packages/core/src/index.ts",
      "packages/create-robkit/templates/base/README.md",
    );

    expect(check("main")).toEqual({
      status: 1,
      output: unnamed("@robkit/core") + unnamed("create-robkit"),
    });
  });
});

describe("which package a changeset must name", () => {
  it("passes a change with a changeset naming its package", async () => {
    await changeset("core", "@robkit/core");
    await change("packages/core/src/index.ts");

    expect(check("main")).toEqual({ status: 0, output: "" });
  });

  it("fails a change to core whose changeset names only input", async () => {
    await changeset("input", "@robkit/input");
    await change("packages/core/src/index.ts");

    expect(check("main")).toEqual({
      status: 1,
      output: unnamed("@robkit/core"),
    });
  });

  it("fails a template change whose changeset doesn't name create-robkit", async () => {
    await changeset("core", "@robkit/core");
    await change(
      "packages/core/src/index.ts",
      "packages/create-robkit/templates/base/compose.yaml",
    );

    expect(check("main")).toEqual({
      status: 1,
      output: unnamed("create-robkit"),
    });
  });

  it("names each package left out", async () => {
    await change("packages/core/src/index.ts", "packages/input/src/index.ts");

    expect(check("main")).toEqual({
      status: 1,
      output: unnamed("@robkit/core") + unnamed("@robkit/input"),
    });
  });

  it("doesn't count a changeset the base already had", async () => {
    git("checkout", "-q", "main");
    await changeset("earlier", "@robkit/core");
    git("add", "-A");
    git("commit", "-q", "--no-verify", "-m", "Add a changeset");
    git("checkout", "-q", "change");
    git("merge", "-q", "--no-edit", "main");
    await change("packages/core/src/index.ts");

    expect(check("main")).toEqual({
      status: 1,
      output: unnamed("@robkit/core"),
    });
  });
});

it("prints its usage without a base", () => {
  expect(check()).toEqual({
    status: 2,
    output: "Usage: check-changesets.ts <base-ref>\n",
  });
});
