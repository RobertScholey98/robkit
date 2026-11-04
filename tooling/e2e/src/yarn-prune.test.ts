import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { defaultChoices, init } from "create-robkit";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { serveTarballs, type FakeRegistry } from "./fake-registry.ts";

const exec = promisify(execFile);

/** Runs a command, and fails with the end of its output if it does. */
async function run(
  command: string,
  args: string[],
  { cwd, env }: { cwd: string; env?: NodeJS.ProcessEnv },
) {
  try {
    return await exec(command, args, { cwd, env, maxBuffer: 1 << 26 });
  } catch (error) {
    const { stdout = "", stderr = "" } = error as {
      stdout?: string;
      stderr?: string;
    };
    throw new Error(
      `${command} ${args.join(" ")} failed:\n${`${stdout}${stderr}`.slice(-4000)}`,
      { cause: error },
    );
  }
}

/** A yarn install's dependencies, installed as yarn's Dockerfile does. */
const frozenInstall = ["install", "--immutable"];

/** Then the app's production dependencies alone, for its runtime image. */
function productionInstall(slug: string): string[] {
  return ["workspaces", "focus", "--production", `@internal/${slug}-app`];
}

// turbo can't prune a yarn lockfile that takes robkit's packages from a
// path, as --link and robkit vendor do, since yarn ties each path to the
// workspace that names it. A user's install takes them from npm, so this
// one takes them from a registry serving the packed packages.
describe("a yarn install that takes robkit's packages from a registry", () => {
  let dir: string;
  let registry: FakeRegistry;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "robkit-yarn-prune-"));
    await init({ ...defaultChoices, packageManager: "yarn" }, dir, {
      link: true,
      install: true,
    });
    await run("yarn", ["run", "robkit", "vendor"], { cwd: dir });
    registry = await serveTarballs(join(dir, "vendor/robkit"));

    const manifestPath = join(dir, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      resolutions?: object;
    };
    delete manifest.resolutions;
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    const settingsPath = join(dir, ".yarnrc.yml");
    const settings = parseDocument(await readFile(settingsPath, "utf8"));
    settings.set("npmRegistryServer", registry.url);
    settings.set("unsafeHttpWhitelist", ["127.0.0.1"]);
    // yarn caches metadata by host, not port, so an earlier run's registry
    // would send it to a port nothing listens on.
    settings.set("globalFolder", join(dir, ".yarn-global"));
    await writeFile(settingsPath, settings.toString());
    // Vendor's own install locked the tarballs by path. Resolve afresh.
    await rm(join(dir, "yarn.lock"));
    await rm(join(dir, "node_modules"), { recursive: true, force: true });

    await run("yarn", ["install", "--no-immutable"], { cwd: dir });
  }, 600_000);

  afterAll(async () => {
    await registry.close();
  });

  it.each(["core", "hub", "admin", "example"])(
    "prunes %s with turbo, and the pruned install passes frozen and production-only",
    { timeout: 300_000 },
    async (slug) => {
      const out = join(dir, `out-${slug}`);
      await run(
        "yarn",
        [
          "turbo",
          "prune",
          `@internal/${slug}-app`,
          "--docker",
          "--out-dir",
          out,
        ],
        { cwd: dir },
      );
      // The Dockerfile's tools stage brings the settings.
      await copyFile(join(dir, ".yarnrc.yml"), join(out, "json/.yarnrc.yml"));

      await expect(
        run("yarn", frozenInstall, { cwd: join(out, "json") }),
      ).resolves.toBeDefined();
      expect(existsSync(join(out, "json/node_modules/typescript"))).toBe(true);

      await rm(join(out, "json/node_modules"), { recursive: true });
      await run("yarn", productionInstall(slug), {
        cwd: join(out, "json"),
        env: { ...process.env, NODE_ENV: "production" },
      });

      expect(existsSync(join(out, "json/node_modules/typescript"))).toBe(false);
      expect(existsSync(join(out, "json/node_modules/hono"))).toBe(true);
    },
  );
});
