import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { devSocket } from "@robkit/dev/cli";
import { describe, expect, it, vi } from "vitest";
import { parse, parseDocument } from "yaml";
import { defaultChoices } from "./choices.ts";
import { installCatalog } from "./generate.ts";
import { init } from "./init.ts";
import { readRobkitRepo, type RobkitRepo } from "./robkit-repo.ts";
import { drive } from "./test/drive.ts";
import { fakePnpm } from "./test/fake-pnpm.ts";
import { gitEnv } from "./test/git.ts";
import { newerVersion, robkitVersion } from "./test/robkit-version.ts";
import {
  changelogBetween,
  compareVersions,
  finishUpgrade,
  readPublished,
  upgrade,
} from "./upgrade.ts";

const run = promisify(execFile);

// Each test writes and commits an install, and most run robkit and a fake
// pnpm as child processes: 2 to 6 seconds alone, and several times that
// under a loaded gate on Windows.
vi.setConfig({ testTimeout: 120_000 });

const bin = fileURLToPath(new URL("robkit-command.ts", import.meta.url));

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
 * to run robkit in: git with a name, and a home of its own, which holds
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
  const env = await gitEnv(true);
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

/** What upgrade writes in the install at `dir`, to check it changed nothing. */
async function written(dir: string): Promise<unknown> {
  const read = (path: string) => readFile(join(dir, path), "utf8");
  return {
    settings: await read("pnpm-workspace.yaml"),
    lockfile: await read("pnpm-lock.yaml"),
    manifest: await read("package.json"),
    lintPolicy: await filesUnder(join(dir, "tooling/eslint")),
  };
}

/**
 * The catalog as step 1 leaves it: create-robkit's entry at the newer
 * version, and every other entry as it was.
 */
async function stepOne(dir: string): Promise<void> {
  await editCatalog(dir, { "create-robkit": newerVersion });
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

describe("robkit upgrade", () => {
  // The robkit it hands over to here is this checkout's, which is the
  // older one, so it raises none of robkit's other entries. The second
  // step's tests, and the upgrade test in tooling/e2e, have a newer one.
  it("moves create-robkit's catalog entry alone to the newest, installs, and hands over to the robkit it installed", async () => {
    const { dir, env } = await committedInstall();
    const pnpm = await fakePnpm({ view: published }, env);

    const nothing = await upgrade(dir, undefined, pnpm.env);

    expect(nothing).toBeUndefined();
    const entries = await robkitEntries(dir);
    expect(entries.length).toBeGreaterThan(10);
    expect(entries.filter(([, version]) => version !== robkitVersion)).toEqual([
      ["create-robkit", newerVersion],
    ]);
    expect(await pnpm.calls()).toEqual([
      ["view", "create-robkit", "dist-tags", "versions", "--json"],
      ["install", "--no-frozen-lockfile"],
      ["exec", "robkit", "upgrade", "--finish", robkitVersion],
    ]);
  });

  it("moves to the version given", async () => {
    const { dir, env } = await committedInstall();
    const pnpm = await fakePnpm(
      {
        view: {
          "dist-tags": { latest: `${newerVersion}9` },
          versions: [robkitVersion, newerVersion, `${newerVersion}9`],
        },
      },
      env,
    );

    await upgrade(dir, newerVersion, pnpm.env);

    expect(await catalogOf(dir)).toMatchObject({
      "create-robkit": newerVersion,
    });
  });

  it("says when the install is on the newest already, and changes nothing", async () => {
    const { dir, env } = await committedInstall();
    const pnpm = await fakePnpm(
      {
        view: {
          "dist-tags": { latest: robkitVersion },
          versions: [robkitVersion],
        },
      },
      env,
    );
    const before = await written(dir);

    expect(await upgrade(dir, undefined, pnpm.env)).toBe(
      `This install is on robkit ${robkitVersion}, the newest.`,
    );
    expect(await written(dir)).toEqual(before);
  });

  it.each([
    [
      "a version the registry doesn't have",
      `${newerVersion}9`,
      `The registry has no create-robkit ${newerVersion}9. Its newest is ${newerVersion}. Run pnpm robkit upgrade with a version it has, or with none for the newest.`,
    ],
    [
      "the version the install is on",
      robkitVersion,
      `This install is on robkit ${robkitVersion} already. robkit upgrade moves forward only: give a newer version, or none for the newest.`,
    ],
    [
      "something that isn't a version",
      "latest",
      `"latest" isn't a version. Give one such as 0.2.0, or none for the newest.`,
    ],
  ])("refuses %s, and changes nothing", async (_, given, message) => {
    const { dir, env } = await committedInstall();
    const pnpm = await fakePnpm({ view: published }, env);
    const before = await written(dir);

    await expect(upgrade(dir, given, pnpm.env)).rejects.toThrow(message);
    expect(await written(dir)).toEqual(before);
    expect(
      (await pnpm.calls()).filter(([command]) => command !== "view"),
    ).toEqual([]);
  });

  it("refuses an older version, and changes nothing", async () => {
    const { dir, env } = await committedInstall();
    const pnpm = await fakePnpm(
      {
        view: {
          "dist-tags": { latest: robkitVersion },
          versions: ["0.0.0-0", robkitVersion],
        },
      },
      env,
    );
    const before = await written(dir);

    await expect(upgrade(dir, "0.0.0-0", pnpm.env)).rejects.toThrow(
      `0.0.0-0 is older than robkit ${robkitVersion}, which this install is on. robkit upgrade moves forward only. To go back, revert the commit that moved the install to ${robkitVersion}.`,
    );
    expect(await written(dir)).toEqual(before);
  });

  it("says what pnpm said when it can't ask the registry", async () => {
    const { dir, env } = await committedInstall();
    const pnpm = await fakePnpm({ view: "fails" }, env);

    await expect(upgrade(dir, undefined, pnpm.env)).rejects.toThrow(
      "robkit upgrade couldn't ask the registry which versions of create-robkit it has: GET https://registry.example/create-robkit: Not Found - 404. Check your network and the registry pnpm uses (pnpm config get registry), then run pnpm robkit upgrade again.",
    );
  });
});

describe("robkit upgrade's checks", () => {
  it("refuses with no git, and changes nothing", async () => {
    const { dir, env } = await committedInstall();
    const pathless = Object.fromEntries(
      Object.entries(env).filter(([key]) => key.toUpperCase() !== "PATH"),
    );
    const pnpm = await fakePnpm({ view: published }, { ...pathless, PATH: "" });
    const before = await written(dir);

    await expect(upgrade(dir, undefined, pnpm.env)).rejects.toThrow(
      "robkit upgrade needs git, so git diff shows what it changes and git can undo it, and git isn't installed. Install git, commit the install, then run pnpm robkit upgrade again.",
    );
    expect(await written(dir)).toEqual(before);
    expect(await pnpm.calls()).toEqual([]);
  });

  it.each([
    ["no repository", () => Promise.resolve()],
    [
      "a repository with no commit",
      (dir: string, env: NodeJS.ProcessEnv) =>
        git(dir, env, "init", "--quiet").then(() => undefined),
    ],
  ])(
    "refuses an install with %s, and gives the commands that commit it",
    async (_, start) => {
      const dir = join(await mkdtemp(join(tmpdir(), "robkit-")), "install");
      await init(defaultChoices, dir, { install: false });
      await writeFile(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
      // No folder above it counts as its repository.
      const env = {
        ...(await gitEnv(true)),
        GIT_CEILING_DIRECTORIES: dirname(dir),
      };
      const pnpm = await fakePnpm({ view: published }, env);
      await start(dir, pnpm.env);
      const before = await written(dir);

      await expect(upgrade(dir, undefined, pnpm.env)).rejects.toThrow(
        `robkit upgrade needs the install committed in git, so git diff shows what it changes and git can undo it, and this install has no commit. Make one, then run pnpm robkit upgrade again:

  git init
  git add --all
  git commit -m "Make a robkit install"`,
      );
      expect(await written(dir)).toEqual(before);
      expect(await pnpm.calls()).toEqual([]);
    },
  );

  it("refuses an uncommitted change and an untracked file, naming each, and changes nothing", async () => {
    const { dir, env } = await committedInstall();
    await writeFile(join(dir, "apps/example/notes.md"), "Mine.\n");
    await writeFile(join(dir, "README.md"), "My install.\n");
    const pnpm = await fakePnpm({ view: published }, env);
    const before = await written(dir);

    await expect(upgrade(dir, undefined, pnpm.env)).rejects.toThrow(
      `robkit upgrade needs every change committed, so git diff shows only what it changes. Commit or remove these, then run pnpm robkit upgrade again:

  README.md (not committed)
  apps/example/notes.md (untracked)`,
    );
    expect(await written(dir)).toEqual(before);
    expect(await pnpm.calls()).toEqual([]);
  });

  it("refuses an uncommitted change to a file it writes, and leaves the change", async () => {
    const { dir, env } = await committedInstall();
    await editCatalog(dir, { "left-pad": "1.3.0" });
    const pnpm = await fakePnpm({ view: published }, env);
    const before = await written(dir);

    await expect(upgrade(dir, undefined, pnpm.env)).rejects.toThrow(
      "  pnpm-workspace.yaml (not committed)",
    );
    expect(await written(dir)).toEqual(before);
  });

  // A link in git needs core.symlinks, which Windows' git leaves off.
  it.skipIf(process.platform === "win32").each([
    ["tooling/eslint", "tooling/eslint"],
    ["tooling", "tooling/eslint"],
    ["vendor/robkit/go", "vendor/robkit/go"],
    ["vendor/robkit", "vendor/robkit/go"],
    ["vendor", "vendor/robkit/go"],
  ])("refuses %s as a link, and changes nothing", async (link, folder) => {
    // What the link points to holds the folder upgrade would replace.
    const elsewhere = await mkdtemp(join(tmpdir(), "robkit-elsewhere-"));
    const kept = join(relative(link, folder), "policy.js");
    await mkdir(dirname(join(elsewhere, kept)), { recursive: true });
    await writeFile(join(elsewhere, kept), "export default [];\n");
    const { dir, env } = await committedInstall(async (dir) => {
      await rm(join(dir, link), { recursive: true, force: true });
      await mkdir(dirname(join(dir, link)), { recursive: true });
      await symlink(elsewhere, join(dir, link));
    });
    const pnpm = await fakePnpm({ view: published }, env);
    const before = await written(dir);

    await expect(upgrade(dir, undefined, pnpm.env)).rejects.toThrow(
      `${link} is a link. robkit upgrade replaces ${folder} whole and follows no link. Put a folder of its own in its place and commit it, then run pnpm robkit upgrade again.`,
    );
    expect(await written(dir)).toEqual(before);
    expect(await filesUnder(elsewhere)).toEqual(
      new Map([[kept, "export default [];\n"]]),
    );
  });

  it
    .skipIf(process.platform === "win32")
    .each(["pnpm-workspace.yaml", "pnpm-lock.yaml", "package.json"])(
    "refuses %s as a link, and changes nothing",
    async (file) => {
      const elsewhere = join(
        await mkdtemp(join(tmpdir(), "robkit-elsewhere-")),
        file,
      );
      const { dir, env } = await committedInstall(async (dir) => {
        await rename(join(dir, file), elsewhere);
        await symlink(elsewhere, join(dir, file));
      });
      const pnpm = await fakePnpm({ view: published }, env);
      const before = await written(dir);

      await expect(upgrade(dir, undefined, pnpm.env)).rejects.toThrow(
        `${file} is a link. robkit upgrade writes that file and follows no link. Put a file of its own in its place and commit it, then run pnpm robkit upgrade again.`,
      );
      // It reads each file through its link, so this is what the link
      // points to as well.
      expect(await written(dir)).toEqual(before);
    },
  );

  // pnpm dev doesn't run on native Windows.
  it.skipIf(process.platform === "win32")(
    "refuses while pnpm dev runs in the install, and changes nothing",
    async ({ onTestFinished }) => {
      const { dir, env } = await committedInstall();
      const { folder, path } = await devSocket(dir, env);
      await mkdir(folder, { recursive: true, mode: 0o700 });
      const asked: string[] = [];
      const runner = createServer((connection) => {
        connection.on("data", (chunk: Buffer) => asked.push(chunk.toString()));
      }).listen(path);
      await once(runner, "listening");
      onTestFinished(() => {
        runner.close();
      });
      const pnpm = await fakePnpm({ view: published }, env);
      const before = await written(dir);

      await expect(upgrade(dir, undefined, pnpm.env)).rejects.toThrow(
        "pnpm dev is running in this install. An upgrade replaces the packages under every running app, so stop pnpm dev, then run pnpm robkit upgrade again.",
      );
      expect(await written(dir)).toEqual(before);
      expect(await pnpm.calls()).toEqual([]);
      expect(asked).toEqual([]);
    },
  );

  it("says a linked install has nothing to upgrade, and changes nothing", async () => {
    const { dir, env } = await committedInstall(undefined, { link: true });
    const pnpm = await fakePnpm({ view: published }, env);
    const before = await written(dir);

    expect(await upgrade(dir, undefined, pnpm.env)).toBe(
      "This install links to a robkit checkout, so robkit upgrade has nothing to move. Pull the checkout to update it.",
    );
    expect(await written(dir)).toEqual(before);
    expect(await pnpm.calls()).toEqual([]);
  });

  it("says a vendored install has nothing to upgrade, and changes nothing", async () => {
    const { dir, env } = await committedInstall(async (dir) => {
      const path = join(dir, "pnpm-workspace.yaml");
      const workspace = parseDocument(await readFile(path, "utf8"));
      workspace.setIn(
        ["overrides", "@robkit/core"],
        `file:vendor/robkit/robkit-core-${robkitVersion}.tgz`,
      );
      await writeFile(path, workspace.toString());
    });
    const pnpm = await fakePnpm({ view: published }, env);
    const before = await written(dir);

    expect(await upgrade(dir, undefined, pnpm.env)).toBe(
      "This install runs the tarballs robkit vendor packed into vendor/robkit, so robkit upgrade has nothing to move. To update them, run pnpm robkit vendor --from <checkout> with a newer robkit checkout's folder.",
    );
    expect(await written(dir)).toEqual(before);
  });
});

describe("robkit upgrade when pnpm install fails", () => {
  const putBack =
    "robkit upgrade put back every file it changed, so the install is as it was at your last commit. Run pnpm install to put node_modules back, fix what the output above says, then run pnpm robkit upgrade again.";

  it("puts every file back when it fails in step 1, and a second run then upgrades", async () => {
    const { dir, env } = await committedInstall();
    const pnpm = await fakePnpm({ view: published, failInstall: 1 }, env);

    await expect(upgrade(dir, undefined, pnpm.env)).rejects.toThrow(
      `Step 1 of robkit upgrade failed: pnpm install couldn't install robkit ${newerVersion}. ${putBack}`,
    );
    expect(await git(dir, env, "status", "--porcelain")).toBe("");

    await pnpm.set({ view: published });
    await upgrade(dir, undefined, pnpm.env);

    expect(await catalogOf(dir)).toMatchObject({
      "create-robkit": newerVersion,
    });
  });

  it("puts back step 1's files and step 2's when it fails in step 2, and a second run then upgrades", async () => {
    const repo = await readRobkitRepo();
    const { dir, env } = await committedInstall(async (dir) => {
      // Step 2 adds it back, then installs.
      await editCatalog(dir, { express: null });
      await writeFile(join(dir, "tooling/eslint/policy.js"), "// Older.\n");
      await writeFile(join(dir, "tooling/eslint/dropped.js"), "// Gone.\n");
    });
    const pnpm = await fakePnpm({ view: published, failInstall: 2 }, env);

    await expect(upgrade(dir, undefined, pnpm.env)).rejects.toThrow(
      `Step 2 of robkit upgrade failed: robkit ${newerVersion} couldn't finish it. ${putBack}`,
    );
    expect(
      await git(dir, env, "status", "--porcelain", "--untracked-files=all"),
    ).toBe("");
    expect((await pnpm.calls()).map((call) => call.slice(0, 2))).toEqual([
      ["view", "create-robkit"],
      ["install", "--no-frozen-lockfile"],
      ["exec", "robkit"],
      ["install", "--no-frozen-lockfile"],
    ]);

    await pnpm.set({ view: published });
    await upgrade(dir, undefined, pnpm.env);

    expect(await catalogOf(dir)).toMatchObject({
      "create-robkit": newerVersion,
      express: repo.catalog.get("express"),
    });
    expect(await filesUnder(join(dir, "tooling/eslint"))).toEqual(
      new Map([...repo.lintPolicy].sort(([a], [b]) => (a < b ? -1 : 1))),
    );
  });
});

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

  it("raises every one of robkit's packages the first step left at the old version, and installs them", async () => {
    const repo = await newerRepo();
    const { dir, env } = await committedInstall();
    const pnpm = await fakePnpm({ view: published }, env);
    await stepOne(dir);

    const said = await finishUpgrade(dir, {
      from: robkitVersion,
      repo,
      changelog: undefined,
      env: pnpm.env,
    });

    const entries = await robkitEntries(dir);
    expect(entries.length).toBeGreaterThan(10);
    expect(entries.filter(([, version]) => version !== newerVersion)).toEqual(
      [],
    );
    expect(await pnpm.calls()).toEqual([["install", "--no-frozen-lockfile"]]);
    // One line for them all, not one for each.
    expect(said).toContain(
      `  pnpm-workspace.yaml: robkit's packages at ${newerVersion}\n`,
    );
  });

  it("keeps the entry of a package this robkit no longer has, at the version it was", async () => {
    const repo = await newerRepo();
    const { dir, env } = await committedInstall(async (dir) => {
      await editCatalog(dir, { "@robkit/dropped": robkitVersion });
    });
    const pnpm = await fakePnpm({ view: published }, env);
    await stepOne(dir);

    await finishUpgrade(dir, {
      from: robkitVersion,
      repo,
      changelog: undefined,
      env: pnpm.env,
    });

    expect(await catalogOf(dir)).toMatchObject({
      "@robkit/dropped": robkitVersion,
      "@robkit/core": newerVersion,
    });
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

  // Run by hand, the second step has no first step's checks before it.
  it.skipIf(process.platform === "win32")(
    "replaces no folder through a link, and leaves what the link points to",
    async () => {
      const repo = await newerRepo();
      const elsewhere = await mkdtemp(join(tmpdir(), "robkit-elsewhere-"));
      await mkdir(join(elsewhere, "eslint"));
      await writeFile(join(elsewhere, "eslint/kept.js"), "// Not robkit's.\n");
      const { dir, env } = await committedInstall(async (dir) => {
        await rm(join(dir, "tooling"), { recursive: true, force: true });
        await symlink(elsewhere, join(dir, "tooling"));
      });
      const pnpm = await fakePnpm({ view: published }, env);
      await stepOne(dir);

      await expect(
        finishUpgrade(dir, {
          from: robkitVersion,
          repo,
          changelog: undefined,
          env: pnpm.env,
        }),
      ).rejects.toThrow(
        "tooling is a link. robkit upgrade replaces tooling/eslint whole and follows no link.",
      );
      expect(await filesUnder(elsewhere)).toEqual(
        new Map([["eslint/kept.js", "// Not robkit's.\n"]]),
      );
    },
  );

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

  pnpm-lock.yaml
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

describe("robkit upgrade on the command line", () => {
  it("prints a linked install's one line and exits 0", async () => {
    const { dir, env } = await committedInstall(undefined, { link: true });

    const { code, output } = await drive(bin, dir, ["upgrade"], [], env);

    expect({ code, output }).toEqual({
      code: 0,
      output:
        "This install links to a robkit checkout, so robkit upgrade has nothing to move. Pull the checkout to update it.\n",
    });
  });

  it("prints its usage, without --finish, for more than one version", async () => {
    const { dir, env } = await committedInstall();

    const { code, output } = await drive(
      bin,
      dir,
      ["upgrade", "1.0.0", "2.0.0"],
      [],
      env,
    );

    expect(code).toBe(1);
    expect(output).toContain("Usage: robkit upgrade [version]");
    expect(output).not.toContain("--finish");
  });

  it("says it is asking the registry before it asks, since pnpm waits over a minute on one it can't reach", async () => {
    const { dir, env } = await committedInstall();
    const pnpm = await fakePnpm({ view: "fails" }, env);

    const { code, output } = await drive(bin, dir, ["upgrade"], [], pnpm.env);

    expect(code).toBe(1);
    const asking = "Asking the registry which versions of robkit it has.\n";
    expect(output.startsWith(asking)).toBe(true);
    expect(output.slice(asking.length)).toContain(
      "robkit upgrade couldn't ask the registry which versions of create-robkit it has",
    );
  });

  // Ctrl+C in a terminal reaches robkit and the pnpm it is running. Windows
  // has no SIGINT for a test to send.
  it.skipIf(process.platform === "win32")(
    "puts every file back when Ctrl+C stops pnpm install",
    async ({ onTestFinished }) => {
      const { dir, env } = await committedInstall();
      const pnpm = await fakePnpm({ view: published, holdInstall: true }, env);
      const robkit = spawn(process.execPath, [bin, "upgrade"], {
        cwd: dir,
        env: { ...process.env, ...pnpm.env },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      robkit.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
      robkit.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
      const installing = await pnpm.held();
      onTestFinished(() => {
        robkit.kill("SIGKILL");
      });

      robkit.kill("SIGINT");
      process.kill(installing, "SIGINT");
      const [code] = (await once(robkit, "exit")) as [number | null];

      expect(output).toContain(
        `Step 1 of robkit upgrade failed: pnpm install couldn't install robkit ${newerVersion}. robkit upgrade put back every file it changed`,
      );
      expect(code).toBe(1);
      expect(
        await git(dir, env, "status", "--porcelain", "--untracked-files=all"),
      ).toBe("");
    },
  );

  it("names step 2 when it fails there, and says why", async () => {
    const { dir, env } = await committedInstall(async (dir) => {
      await editCatalog(dir, { express: null });
    });
    const pnpm = await fakePnpm({ view: published, failInstall: 2 }, env);

    const { code, output } = await drive(
      bin,
      dir,
      ["upgrade"],
      [],
      pnpm.env,
      60_000,
    );

    expect(code).toBe(1);
    expect(output).toContain(
      `robkit ${robkitVersion} couldn't finish the upgrade: pnpm install --no-frozen-lockfile exited with 1 in ${dir}.`,
    );
    expect(output).toContain(
      `Step 2 of robkit upgrade failed: robkit ${newerVersion} couldn't finish it.`,
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

describe("readPublished", () => {
  it("reads the newest and every version", () => {
    expect(
      readPublished({
        "dist-tags": { latest: "0.2.0" },
        versions: ["0.1.0", "0.2.0"],
      }),
    ).toEqual({ latest: "0.2.0", versions: ["0.1.0", "0.2.0"] });
  });

  it("reads one version, which pnpm gives as a string", () => {
    expect(
      readPublished({ "dist-tags": { latest: "0.1.0" }, versions: "0.1.0" }),
    ).toEqual({ latest: "0.1.0", versions: ["0.1.0"] });
  });

  it.each([
    null,
    [],
    { versions: ["0.1.0"] },
    { "dist-tags": { latest: "0.1.0" } },
  ])("refuses %j", (json) => {
    expect(readPublished(json)).toEqual({
      error:
        "pnpm view answered without create-robkit's dist-tags and versions.",
    });
  });
});
