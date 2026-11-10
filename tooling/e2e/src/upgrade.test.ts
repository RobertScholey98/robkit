// robkit upgrade the way an owner runs it: an install made with `npm create
// robkit` from a registry that then has a newer version, moved to it with
// `pnpm robkit upgrade`. Nothing is on npm yet, so a local registry serves
// two versions of robkit's packages: the checkout packed, and the same
// tarballs repacked a patch higher.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { removeWhenGone } from "@internal/test-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse, parseDocument } from "yaml";
import { nextPatch, packNewer } from "./newer-version.ts";
import {
  packRobkit,
  registryEnv,
  run,
  serveRobkit,
  type LocalRegistry,
} from "./registry.ts";

const lintPolicyLine = "// The newer version's lint policy.";
const goModLine = "// The newer version's Go module.";

/** Every file under `dir`, by its path from there. */
function filesUnder(dir: string): Map<string, string> {
  const entries = readdirSync(dir, { recursive: true, withFileTypes: true });
  return new Map(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const file = join(entry.parentPath, entry.name);
        return [relative(dir, file), readFileSync(file, "utf8")] as const;
      })
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  );
}

/** The catalog in the install at `dir`'s pnpm settings, by name. */
async function catalogOf(dir: string): Promise<Record<string, string>> {
  const settings = parse(
    await readFile(join(dir, "pnpm-workspace.yaml"), "utf8"),
    { schema: "failsafe" },
  ) as { catalog: Record<string, string> };
  return settings.catalog;
}

describe("robkit upgrade from a registry", () => {
  let registry: LocalRegistry;
  let home: string;
  /** The install, with its example on Go, made at the older version. */
  let dir: string;
  let env: NodeJS.ProcessEnv;
  let older: string;
  let newer: string;
  /** What the newer version carries, from its packed create-robkit. */
  let carried: { catalog: Record<string, string>; packageManager: string };
  /** The catalog before the upgrade, as the test left it. */
  let before: Record<string, string>;
  /** What `pnpm robkit upgrade` printed. */
  let said: string;

  beforeAll(async () => {
    home = await mkdtemp(join(tmpdir(), "robkit-upgrade-"));
    removeWhenGone({ path: home });
    const packed = join(home, "packed");
    await packRobkit(packed);
    const manifest = JSON.parse(
      await readFile(
        new URL(
          "../../../packages/create-robkit/package.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as { version: string };
    older = manifest.version;
    newer = nextPatch(older);
    await packNewer(
      packed,
      { from: older, to: newer },
      {
        lintPolicyLine,
        goModLine,
        changelog: `# create-robkit

## ${newer}

### Patch Changes

- 1234567: The upgrade test's own entry.

## ${older}

### Patch Changes

- 7654321: An entry from before the upgrade.
`,
      },
    );
    registry = await serveRobkit(packed);
    env = registryEnv(registry, home);
    carried = JSON.parse(
      await run(
        "tar",
        [
          "-xzOf",
          join(packed, `create-robkit-${newer}.tgz`),
          "package/dist/carried.json",
        ],
        { cwd: home, env },
      ),
    ) as typeof carried;

    await run(
      "npm",
      ["create", `robkit@${older}`, "install", "--", "--stack", "go"],
      { cwd: home, env },
    );
    dir = join(home, "install");

    // An install made by an older robkit can lack an entry the newer one
    // needs, or hold one lower. Neither is one this install runs on, so
    // its lockfile stands. The owner's own entry stays as it is.
    const path = join(dir, "pnpm-workspace.yaml");
    const workspace = parseDocument(await readFile(path, "utf8"));
    workspace.deleteIn(["catalog", "next"]);
    workspace.setIn(["catalog", "express"], "4.0.0");
    workspace.setIn(["catalog", "left-pad"], "1.3.0");
    await writeFile(path, workspace.toString());
    await run("git", ["commit", "--quiet", "--all", "-m", "Edit the catalog"], {
      cwd: dir,
      env,
    });
    before = await catalogOf(dir);

    said = await run("pnpm", ["robkit", "upgrade"], { cwd: dir, env });
  }, 900_000);

  afterAll(async () => {
    await registry.close();
    await rm(home, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 500,
    });
  });

  it("moves robkit's packages to the newer version, which then installs", async () => {
    const catalog = await catalogOf(dir);
    const robkit = Object.entries(catalog).filter(
      ([name]) => name.startsWith("@robkit/") || name === "create-robkit",
    );

    expect(robkit.length).toBeGreaterThan(10);
    expect(robkit.filter(([, version]) => version !== newer)).toEqual([]);
    await run("pnpm", ["install", "--frozen-lockfile"], { cwd: dir, env });
    const installed = JSON.parse(
      await readFile(
        join(dir, "node_modules/create-robkit/package.json"),
        "utf8",
      ),
    ) as { version: string };
    expect(installed.version).toBe(newer);
  });

  it("adds an entry the newer version needs, raises one it holds too low, keeps the owner's, and takes its pnpm", async () => {
    const catalog = await catalogOf(dir);
    const rootManifest = JSON.parse(
      await readFile(join(dir, "package.json"), "utf8"),
    ) as { packageManager: string };

    expect(before.next).toBeUndefined();
    expect([catalog.next, catalog.express, catalog["left-pad"]]).toEqual([
      carried.catalog.next,
      carried.catalog.express,
      "1.3.0",
    ]);
    expect(rootManifest.packageManager).toBe(carried.packageManager);
  });

  it("replaces vendor/robkit/go and the lint policy with the newer version's, and changes no file under apps", async () => {
    const changed = await run(
      "git",
      ["status", "--porcelain", "--untracked-files=all"],
      { cwd: dir, env },
    );

    expect(
      readFileSync(join(dir, "tooling/eslint/policy.js"), "utf8"),
    ).toContain(`${lintPolicyLine}\n`);
    expect(
      readFileSync(join(dir, "vendor/robkit/go/go.mod"), "utf8"),
    ).toContain(`${goModLine}\n`);
    expect(filesUnder(join(dir, "vendor/robkit/go")).size).toBeGreaterThan(5);
    expect(
      changed.split("\n").filter((line) => line.slice(3).startsWith("apps/")),
    ).toEqual([]);
  });

  it("prints what it did and the changelog entries between the two versions", () => {
    expect(said).toContain(`Upgraded robkit from ${older} to ${newer}.`);
    expect(said).toContain("- 1234567: The upgrade test's own entry.");
    expect(said).not.toContain("An entry from before the upgrade.");
    expect(said).toContain(
      "Next, read git diff, run pnpm lint, pnpm typecheck and pnpm test, then commit.",
    );
  });

  it.each(["lint", "typecheck", "build"])(
    "passes its own %s afterwards",
    { timeout: 600_000 },
    async (script) => {
      await expect(
        run("pnpm", ["run", script], { cwd: dir, env }),
      ).resolves.toBeTypeOf("string");
    },
  );

  it("says the install is on the newest once it is", async () => {
    await run("git", ["add", "--all"], { cwd: dir, env });
    await run("git", ["commit", "--quiet", "-m", "Upgrade robkit"], {
      cwd: dir,
      env,
    });

    const again = await run("pnpm", ["--silent", "robkit", "upgrade"], {
      cwd: dir,
      env,
    });

    expect(again.trim()).toBe(
      `This install is on robkit ${newer}, the newest.`,
    );
  });
});
