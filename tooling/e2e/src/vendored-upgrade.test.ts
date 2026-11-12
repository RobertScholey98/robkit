// robkit upgrade in an install that runs the tarballs robkit vendor packed,
// once robkit is on a registry. The install is as robkit vendor left one
// before robkit could move it, as the robscholey.com install is: made by
// robkit at the checkout's version, with an override naming a tarball in
// vendor/robkit for every robkit package and the catalog at that version.
// A local registry then serves a newer robkit and not the vendored one.
import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

const lintPolicyLine = "// The registry's lint policy.";
const goModLine = "// The registry's Go module.";

const isRobkit = (name: string) =>
  name.startsWith("@robkit/") || name === "create-robkit";

/** The install at `dir`'s pnpm settings. */
async function settingsOf(dir: string) {
  return parse(await readFile(join(dir, "pnpm-workspace.yaml"), "utf8"), {
    schema: "failsafe",
  }) as { catalog: Record<string, string>; overrides: Record<string, string> };
}

/** A packed tarball's package name. */
async function nameIn(tarball: string, env: NodeJS.ProcessEnv) {
  const manifest = await run(
    "tar",
    ["-xzOf", tarball, "package/package.json"],
    {
      cwd: tmpdir(),
      env,
    },
  );
  return (JSON.parse(manifest) as { name: string }).name;
}

describe("robkit upgrade in a vendored install", () => {
  let registry: LocalRegistry;
  let home: string;
  /** The vendored install, with its example on Go. */
  let dir: string;
  let env: NodeJS.ProcessEnv;
  let vendored: string;
  let released: string;
  /** What `pnpm robkit upgrade` printed, with the vendored robkit. */
  let printed: string;
  /** What the command it printed then printed. */
  let said: string;

  beforeAll(async () => {
    home = await mkdtemp(join(tmpdir(), "robkit-vendored-"));
    removeWhenGone({ path: home });
    const older = join(home, "older");
    const newer = join(home, "newer");
    await packRobkit(older);
    const manifest = JSON.parse(
      await readFile(
        new URL(
          "../../../packages/create-robkit/package.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as { version: string };
    vendored = manifest.version;
    released = nextPatch(vendored);
    await cp(older, newer, { recursive: true });
    await packNewer(
      newer,
      { from: vendored, to: released },
      { lintPolicyLine, goModLine, changelog: "# create-robkit\n" },
    );
    const tarballs = (await readdir(older)).filter((file) =>
      file.endsWith(".tgz"),
    );
    for (const file of tarballs) await rm(join(newer, file));

    // The install is made from a registry with the vendored version, which
    // the registry it upgrades from then lacks.
    const first = await serveRobkit(older);
    try {
      await run(
        "npm",
        ["create", `robkit@${vendored}`, "install", "--", "--stack", "go"],
        { cwd: home, env: registryEnv(first, home) },
      );
    } finally {
      await first.close();
    }
    dir = join(home, "install");
    registry = await serveRobkit(newer);
    env = registryEnv(registry, home);

    // What robkit vendor wrote before it could move an install.
    const path = join(dir, "pnpm-workspace.yaml");
    const workspace = parseDocument(await readFile(path, "utf8"));
    for (const file of tarballs) {
      await cp(join(older, file), join(dir, "vendor/robkit", file));
      const name = await nameIn(join(older, file), env);
      workspace.setIn(["overrides", name], `file:vendor/robkit/${file}`);
    }
    await writeFile(path, workspace.toString());
    await run("pnpm", ["install", "--no-frozen-lockfile"], { cwd: dir, env });
    await run("git", ["add", "--all"], { cwd: dir, env });
    await run("git", ["commit", "--quiet", "-m", "Vendor robkit"], {
      cwd: dir,
      env,
    });

    printed = await run("pnpm", ["--silent", "robkit", "upgrade"], {
      cwd: dir,
      env,
    });
    const command = /run (pnpm dlx [^.]+)\./.exec(printed)?.[1];
    if (command === undefined) {
      throw new Error(
        `robkit upgrade printed no pnpm dlx command:\n${printed}`,
      );
    }
    const [pnpm = "", ...args] = command.split(" ");
    said = await run(pnpm, args, { cwd: dir, env });
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

  it("says, with the vendored robkit, what moves the install when the registry lacks that robkit", () => {
    expect(printed.trim().split("\n")).toEqual([
      "Asking the registry which versions of robkit it has.",
      `The registry has no robkit ${vendored}, so this install stays on the tarballs in vendor/robkit. To move to the newest robkit on the registry, run pnpm dlx --package create-robkit robkit upgrade. Before robkit is released, run pnpm robkit vendor --from <checkout> to take a newer robkit from a checkout.`,
    ]);
  });

  it("moves every robkit package to the registry's newest, with no override for any, and installs it", async () => {
    const { catalog, overrides } = await settingsOf(dir);
    const robkit = Object.entries(catalog).filter(([name]) => isRobkit(name));

    expect(robkit.length).toBeGreaterThan(10);
    expect(robkit.filter(([, version]) => version !== released)).toEqual([]);
    expect(overrides).toEqual({ "styled-jsx>@babel/core": "-" });
    await run("pnpm", ["install", "--frozen-lockfile"], { cwd: dir, env });
    const installed = JSON.parse(
      await readFile(
        join(dir, "node_modules/create-robkit/package.json"),
        "utf8",
      ),
    ) as { version: string };
    expect(installed.version).toBe(released);
  });

  it("removes the tarballs, keeps vendor/robkit/go with the registry's Go module, and takes its lint policy", async () => {
    expect(await readdir(join(dir, "vendor/robkit"))).toEqual(["go"]);
    expect(
      await readFile(join(dir, "vendor/robkit/go/go.mod"), "utf8"),
    ).toContain(`${goModLine}\n`);
    expect(
      await readFile(join(dir, "tooling/eslint/policy.js"), "utf8"),
    ).toContain(`${lintPolicyLine}\n`);
  });

  it("says what it changed", () => {
    expect(said).toContain(
      `Moved this install off the tarballs in vendor/robkit, to robkit ${released} from the registry. It changed:`,
    );
    expect(said).toContain("  vendor/robkit: removed robkit's tarballs\n");
    expect(said).toContain(
      "Next, read git diff, run pnpm lint, pnpm typecheck and pnpm test, then commit.",
    );
  });

  it("builds afterwards", { timeout: 600_000 }, async () => {
    await expect(
      run("pnpm", ["run", "build"], { cwd: dir, env }),
    ).resolves.toBeTypeOf("string");
  });
});
