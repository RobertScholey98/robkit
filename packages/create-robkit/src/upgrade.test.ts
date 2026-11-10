import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { parse, parseDocument } from "yaml";
import { defaultChoices } from "./choices.ts";
import { installCatalog } from "./generate.ts";
import { init } from "./init.ts";
import { readRobkitRepo, type RobkitRepo } from "./robkit-repo.ts";
import { fakePnpm } from "./test/fake-pnpm.ts";
import { gitEnv } from "./test/git.ts";
import { newerVersion, robkitVersion } from "./test/robkit-version.ts";
import { changelogBetween, compareVersions, finishUpgrade } from "./upgrade.ts";

const run = promisify(execFile);

/** What `pnpm view` says of create-robkit: this version and a newer one. */
const published = {
  "dist-tags": { latest: newerVersion },
  versions: [robkitVersion, newerVersion],
};

async function git(dir: string, env: NodeJS.ProcessEnv, ...args: string[]) {
  return (await run("git", args, { cwd: dir, env })).stdout;
}

/**
 * A written install, committed with `edit` made first, and the environment
 * to run robkit in: git with a name, and an XDG_RUNTIME_DIR of its own for
 * pnpm dev's socket.
 */
async function committedInstall(
  edit: (dir: string) => Promise<void> = () => Promise.resolve(),
  { link = false }: { link?: boolean } = {},
) {
  const dir = join(await mkdtemp(join(tmpdir(), "robkit-")), "install");
  await init(defaultChoices, dir, { install: false, link });
  await writeFile(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  await edit(dir);
  const env = {
    ...(await gitEnv(true)),
    XDG_RUNTIME_DIR: await mkdtemp(join(tmpdir(), "robkit-run-")),
  };
  await git(dir, env, "init", "--quiet");
  await git(dir, env, "add", "--all");
  await git(dir, env, "commit", "--quiet", "-m", "Make a robkit install");
  return { dir, env };
}

/** Changes the catalog in the install at `dir`, keeping the file's comments. */
async function editCatalog(
  dir: string,
  entries: Record<string, string | null>,
) {
  const path = join(dir, "pnpm-workspace.yaml");
  const workspace = parseDocument(await readFile(path, "utf8"));
  for (const [name, version] of Object.entries(entries)) {
    if (version === null) workspace.deleteIn(["catalog", name]);
    else workspace.setIn(["catalog", name], version);
  }
  await writeFile(path, workspace.toString());
}

async function catalogOf(dir: string): Promise<Record<string, string>> {
  const settings = parse(
    await readFile(join(dir, "pnpm-workspace.yaml"), "utf8"),
    {
      schema: "failsafe",
    },
  ) as { catalog: Record<string, string> };
  return settings.catalog;
}

const isRobkit = (name: string) =>
  name.startsWith("@robkit/") || name === "create-robkit";

/** The catalog's entries for robkit's packages, by name. */
async function robkitEntries(dir: string) {
  return Object.entries(await catalogOf(dir)).filter(([name]) =>
    isRobkit(name),
  );
}

async function packageManagerOf(dir: string): Promise<unknown> {
  const manifest = JSON.parse(
    await readFile(join(dir, "package.json"), "utf8"),
  ) as { packageManager?: unknown };
  return manifest.packageManager;
}

/** Every file under `dir`, by its path from there, or none if it's missing. */
async function filesUnder(dir: string): Promise<Map<string, string>> {
  if (!existsSync(dir)) return new Map();
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = new Map<string, string>();
  for (const entry of entries.filter((entry) => entry.isFile())) {
    const file = join(entry.parentPath, entry.name);
    files.set(
      relative(dir, file).replaceAll("\\", "/"),
      await readFile(file, "utf8"),
    );
  }
  return new Map([...files].sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** The catalog as step 1 leaves it: robkit's entries at the newer version. */
async function stepOne(dir: string): Promise<void> {
  const names = (await robkitEntries(dir)).map(([name]) => name);
  await editCatalog(
    dir,
    Object.fromEntries(names.map((name) => [name, newerVersion])),
  );
}

/** robkit as this checkout carries it, every package a version newer. */
async function newerRepo(): Promise<RobkitRepo> {
  const repo = await readRobkitRepo();
  const packages = new Map(
    [...repo.packages].map(([name, pkg]) => [
      name,
      { ...pkg, version: newerVersion },
    ]),
  );
  return { ...repo, packages };
}

describe("robkit upgrade's second step", () => {
  it("adds a missing catalog entry and raises a low one, keeps the owner's own, lowers none, and raises packageManager", async () => {
    const repo = await newerRepo();
    const { dir, env } = await committedInstall(async (dir) => {
      await editCatalog(dir, {
        express: null,
        hono: "1.0.0",
        "left-pad": "1.3.0",
        react: "99.0.0",
      });
      const manifestPath = join(dir, "package.json");
      const manifest = JSON.parse(
        await readFile(manifestPath, "utf8"),
      ) as object;
      await writeFile(
        manifestPath,
        `${JSON.stringify({ ...manifest, packageManager: "pnpm@10.0.0" }, null, 2)}\n`,
      );
    });
    const pnpm = await fakePnpm({ view: published }, env);
    await stepOne(dir);

    const said = await finishUpgrade(dir, {
      from: robkitVersion,
      repo,
      changelog: undefined,
      env: pnpm.env,
    });

    const express = repo.catalog.get("express");
    const hono = repo.catalog.get("hono");
    expect(await catalogOf(dir)).toMatchObject({
      "create-robkit": newerVersion,
      express,
      hono,
      "left-pad": "1.3.0",
      react: "99.0.0",
    });
    expect(await packageManagerOf(dir)).toBe(repo.packageManager);
    expect(await pnpm.calls()).toEqual([["install", "--no-frozen-lockfile"]]);
    expect(await readFile(join(dir, "pnpm-workspace.yaml"), "utf8")).toContain(
      "# Manifests say `catalog:`, so every external version lives in the catalog.\n",
    );
    expect(said).toContain(
      `  package.json: packageManager ${repo.packageManager}\n`,
    );
    expect(said).toContain(
      `  pnpm-workspace.yaml: robkit's packages at ${newerVersion}; added express ${String(express)}; raised hono from 1.0.0 to ${String(hono)}\n`,
    );
  });

  it("needs every catalog entry the new version's templates take", async () => {
    const repo = await newerRepo();
    const { dir, env } = await committedInstall();
    const pnpm = await fakePnpm({ view: published }, env);
    await stepOne(dir);

    await finishUpgrade(dir, {
      from: robkitVersion,
      repo,
      changelog: undefined,
      env: pnpm.env,
    });

    expect(await catalogOf(dir)).toMatchObject(
      Object.fromEntries(await installCatalog(repo)),
    );
  });

  it("replaces the lint policy and the Go module whole, and changes no file under apps", async () => {
    const repo = await newerRepo();
    const { dir, env } = await committedInstall(async (dir) => {
      await writeFile(join(dir, "tooling/eslint/policy.js"), "// Older.\n");
      await writeFile(join(dir, "tooling/eslint/dropped.js"), "// Gone.\n");
      await mkdir(join(dir, "apps/gopher"));
      await writeFile(join(dir, "apps/gopher/go.mod"), "module gopher\n");
      await mkdir(join(dir, "vendor/robkit/go"), { recursive: true });
      await writeFile(join(dir, "vendor/robkit/go/go.mod"), "module older\n");
      await writeFile(join(dir, "vendor/robkit/go/dropped.go"), "package go\n");
    });
    const pnpm = await fakePnpm({ view: published }, env);
    await stepOne(dir);

    const said = await finishUpgrade(dir, {
      from: robkitVersion,
      repo,
      changelog: undefined,
      env: pnpm.env,
    });

    const sorted = (files: Map<string, string>) =>
      new Map([...files].sort(([a], [b]) => (a < b ? -1 : 1)));
    expect(await filesUnder(join(dir, "tooling/eslint"))).toEqual(
      sorted(repo.lintPolicy),
    );
    expect(await filesUnder(join(dir, "vendor/robkit/go"))).toEqual(
      sorted(repo.goModule),
    );
    expect(
      await git(
        dir,
        env,
        "status",
        "--porcelain",
        "--untracked-files=all",
        "--",
        "apps",
      ),
    ).toBe("");
    expect(said).toContain(
      `  tooling/eslint: robkit ${newerVersion}'s lint policy\n  vendor/robkit/go: robkit ${newerVersion}'s Go module\n`,
    );
  });

  it("writes no Go module in an install with no Go app", async () => {
    const { dir, env } = await committedInstall();
    const pnpm = await fakePnpm({ view: published }, env);
    await stepOne(dir);

    await finishUpgrade(dir, {
      from: robkitVersion,
      repo: await newerRepo(),
      changelog: undefined,
      env: pnpm.env,
    });

    expect(existsSync(join(dir, "vendor"))).toBe(false);
  });

  it("installs nothing when it changes neither the catalog nor packageManager", async () => {
    const { dir, env } = await committedInstall();
    const pnpm = await fakePnpm({ view: published }, env);

    await finishUpgrade(dir, {
      from: robkitVersion,
      repo: await readRobkitRepo(),
      changelog: undefined,
      env: pnpm.env,
    });

    expect(await pnpm.calls()).toEqual([]);
  });

  it("says what it did, the changelog between the two versions and what to run next", async () => {
    const { dir, env } = await committedInstall();
    const pnpm = await fakePnpm({ view: published }, env);
    await stepOne(dir);
    const changelog = `# create-robkit

## ${newerVersion}9

### Patch Changes

- abc1234: After the upgrade.

## ${newerVersion}

### Minor Changes

- def5678: Rename one thing in the hub by hand.

## ${robkitVersion}

### Patch Changes

- 0123456: Before the upgrade.
`;

    const said = await finishUpgrade(dir, {
      from: robkitVersion,
      repo: await newerRepo(),
      changelog,
      env: pnpm.env,
    });

    expect(said)
      .toBe(`Upgraded robkit from ${robkitVersion} to ${newerVersion}. It changed:

  pnpm-workspace.yaml: robkit's packages at ${newerVersion}

create-robkit's changelog from ${robkitVersion} to ${newerVersion}. It says what to change by hand in your apps, the hub and admin, which upgrade never rewrites:

## ${newerVersion}

### Minor Changes

- def5678: Rename one thing in the hub by hand.

Next, read git diff, run pnpm lint, pnpm typecheck and pnpm test, then commit.`);
  });

  it("refuses a --finish that isn't a version", async () => {
    const { dir, env } = await committedInstall();

    await expect(
      finishUpgrade(dir, {
        from: "older",
        repo: await newerRepo(),
        changelog: undefined,
        env,
      }),
    ).rejects.toThrow(
      `robkit upgrade --finish takes the version the install was on, and "older" isn't one.`,
    );
  });
});

describe("compareVersions", () => {
  it.each([
    ["1.2.3", "1.2.3", 0],
    ["1.2.3", "1.2.4", -1],
    ["1.10.0", "1.9.0", 1],
    ["2.0.0", "10.0.0", -1],
    ["1.0.0-1", "1.0.0", -1],
    ["1.0.0-alpha", "1.0.0-alpha.1", -1],
    ["1.0.0-alpha.2", "1.0.0-alpha.10", -1],
    ["1.0.0-1", "1.0.0-alpha", -1],
    ["1.0.0-beta", "1.0.0-alpha", 1],
    ["1.0.0+build", "1.0.0", 0],
  ])("orders %s against %s", (a, b, order) => {
    expect(Math.sign(compareVersions(a, b) ?? Number.NaN)).toBe(order);
  });

  it.each(["1.2", "latest", "^1.2.3", ""])("can't order %j", (text) => {
    expect(compareVersions(text, "1.0.0")).toBeUndefined();
  });
});

describe("changelogBetween", () => {
  const changelog = `# create-robkit

## 0.3.0

- Third.

## 0.2.0

- Second.

## 0.1.0

- First.
`;

  it("keeps each version after the first, up to the second", () => {
    expect(changelogBetween(changelog, "0.1.0", "0.3.0")).toBe(
      "## 0.3.0\n\n- Third.\n\n## 0.2.0\n\n- Second.",
    );
  });

  it("has nothing between a version and itself", () => {
    expect(changelogBetween(changelog, "0.3.0", "0.3.0")).toBeUndefined();
  });

  it("reads a changelog with Windows line endings", () => {
    expect(
      changelogBetween(changelog.replaceAll("\n", "\r\n"), "0.2.0", "0.3.0"),
    ).toBe("## 0.3.0\n\n- Third.");
  });
});
