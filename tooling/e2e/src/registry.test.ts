// An install the way a new owner makes one: `npm create robkit` from a
// registry, in a folder with no robkit checkout in reach. Nothing is on npm
// yet, so a local registry serves robkit's packed packages, published
// seconds ago, and sends every other request on to npm.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { removeWhenGone } from "@internal/test-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { useDevStack } from "./dev-stack.ts";
import { addedSlug, exampleSlug } from "./install.ts";
import { ownerJourney } from "./owner-journey.ts";
import { packRobkit, serveRobkit, type LocalRegistry } from "./registry.ts";

const exec = promisify(execFile);

/** Runs a command, and fails with the end of its output if it does. */
async function run(
  command: string,
  args: string[],
  { cwd, env }: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<string> {
  try {
    const { stdout } = await exec(command, args, {
      cwd,
      env,
      maxBuffer: 1 << 26,
    });
    return stdout;
  } catch (error) {
    const { stdout = "", stderr = "" } = error as {
      stdout?: string;
      stderr?: string;
    };
    throw new Error(
      `${command} ${args.join(" ")} failed in ${cwd}:\n${`${stdout}${stderr}`.slice(-6000)}`,
      { cause: error },
    );
  }
}

/** The apps robkit add gives the install, one on each other stack. */
const added = [
  // useDevStack waits for an app with this slug.
  { slug: addedSlug, stack: "react-hono" },
  { slug: "express", stack: "express" },
  { slug: "nextjs", stack: "next" },
  { slug: "gopher", stack: "go" },
];

const robkitModule = "github.com/RobertScholey98/robkit/go";

describe("an install from a registry", () => {
  let registry: LocalRegistry;
  /** A folder outside the repo, with no checkout above it. */
  let home: string;
  /** The install, with its example on Start and an app on every other stack. */
  let dir: string;
  /** pnpm's settings as init wrote them, before any install ran. */
  let settingsAsWritten: string;
  /** Whether the install had vendor/robkit/go before its first Go app. */
  let hadGoModule: boolean;
  let env: NodeJS.ProcessEnv;

  beforeAll(async () => {
    home = await mkdtemp(join(tmpdir(), "robkit-registry-"));
    removeWhenGone({ path: home });
    const packed = join(home, "packed");
    await packRobkit(packed);
    registry = await serveRobkit(packed);
    env = {
      ...process.env,
      npm_config_registry: registry.url,
      // A cache of its own, so npm can't run a create-robkit an earlier
      // run packed at the same version.
      npm_config_cache: join(home, ".npm"),
      // pnpm reads its own settings, not npm's.
      pnpm_config_registry: registry.url,
      // pnpm lets a package under a day old through, and exempts it in the
      // install's settings itself, unless told to be strict. Strict, an
      // install that didn't exempt robkit's packages would fail.
      pnpm_config_minimum_release_age_strict: "true",
    };
    delete env.GOFLAGS;

    const version = registry.versions.get("create-robkit");
    await run(
      "npm",
      [
        "create",
        `robkit@${String(version)}`,
        "install",
        "--",
        "--stack",
        "start",
      ],
      { cwd: home, env },
    );
    dir = join(home, "install");
    settingsAsWritten = await readFile(
      join(dir, "pnpm-workspace.yaml"),
      "utf8",
    );
    await run("pnpm", ["install"], { cwd: dir, env });
    hadGoModule = existsSync(join(dir, "vendor/robkit/go"));
    for (const { slug, stack } of added) {
      await run(
        "pnpm",
        ["run", "robkit", "add", slug, "--stack", stack, "--access", "open"],
        { cwd: dir, env },
      );
    }
    await run("pnpm", ["install"], { cwd: dir, env });
  }, 900_000);

  afterAll(async () => {
    await registry.close();
    // pnpm dev's last processes may still be writing as they stop.
    await rm(home, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 500,
    });
  });

  it("names robkit's packages at the versions packed, with no overrides for them", async () => {
    const settings = parse(
      await readFile(join(dir, "pnpm-workspace.yaml"), "utf8"),
      { schema: "failsafe" },
    ) as {
      catalog: Record<string, string>;
      overrides?: Record<string, string>;
    };
    const isRobkit = (name: string) =>
      name.startsWith("@robkit/") || name === "create-robkit";
    const catalogued = Object.entries(settings.catalog).filter(([name]) =>
      isRobkit(name),
    );

    expect(catalogued.length).toBeGreaterThan(0);
    for (const [name, version] of catalogued) {
      expect([name, version]).toEqual([name, registry.versions.get(name)]);
    }
    expect(Object.keys(settings.overrides ?? {}).filter(isRobkit)).toEqual([]);
  });

  it("installs robkit's packages under pnpm's release-age rule because the install exempts them", async () => {
    // A project that doesn't exempt them, against the same registry.
    const bare = join(home, "bare");
    await mkdir(bare);
    await writeFile(
      join(bare, "package.json"),
      JSON.stringify({
        private: true,
        dependencies: {
          "@robkit/input": registry.versions.get("@robkit/input"),
        },
      }),
    );

    await expect(run("pnpm", ["install"], { cwd: bare, env })).rejects.toThrow(
      "ERR_PNPM_NO_MATURE_MATCHING_VERSION",
    );
    // The install's own exemption covered every package, so pnpm added none.
    expect(await readFile(join(dir, "pnpm-workspace.yaml"), "utf8")).toBe(
      settingsAsWritten,
    );
    expect(existsSync(join(dir, "node_modules/.pnpm/@robkit+core@0.0.0"))).toBe(
      true,
    );
  });

  it.each(["lint", "typecheck", "test", "build"])(
    "passes its own %s, for an app on every stack",
    { timeout: 600_000 },
    async (script) => {
      await expect(
        run("pnpm", ["run", script], { cwd: dir, env }),
      ).resolves.toBeTypeOf("string");
    },
  );

  it("writes vendor/robkit/go with the first Go app robkit add gives it", async () => {
    expect(hadGoModule).toBe(false);
    expect(
      await readFile(join(dir, "vendor/robkit/go/go.mod"), "utf8"),
    ).toContain(`module ${robkitModule}\n`);
  });

  it("builds a Go app against vendor/robkit/go, with no GOFLAGS, and with no module proxy once its other modules are cached", async () => {
    const app = join(dir, "apps/gopher");

    await run("go", ["build", "./..."], { cwd: app, env });
    await run("go", ["build", "./..."], {
      cwd: app,
      env: { ...env, GOPROXY: "off" },
    });
    const listed = await run("go", ["list", "-m", robkitModule], {
      cwd: app,
      env,
    });

    expect(listed.trim()).toMatch(
      new RegExp(`^${robkitModule} \\S+ => \\.\\./\\.\\./vendor/robkit/go$`),
    );
  });

  it("writes vendor/robkit/go for a Go example, which builds against it", async () => {
    const version = registry.versions.get("create-robkit");
    await run(
      "npm",
      [
        "create",
        `robkit@${String(version)}`,
        "go-install",
        "--",
        "--stack",
        "go",
      ],
      { cwd: home, env },
    );
    const example = join(home, "go-install/apps/example");

    // Its other modules are in the cache from the Go app above.
    await run("go", ["build", "./..."], {
      cwd: example,
      env: { ...env, GOPROXY: "off" },
    });
    const listed = await run("go", ["list", "-m", robkitModule], {
      cwd: example,
      env,
    });

    expect(listed.trim()).toMatch(/ => \.\.\/\.\.\/vendor\/robkit\/go$/);
  });

  // robkit-dev, robkit-core serve, robkit-migrate and robkit() all come from
  // installed packages here, not a checkout. Nothing else runs that path.
  describe("pnpm dev", () => {
    const dev = useDevStack({ name: "registry", dir: () => dir });

    it("brings up the hub and the example, which answers the owner once signed in", async () => {
      await dev.claimed();

      const journey = await ownerJourney(dev.journey());

      expect([journey.signedInAt, journey.heading]).toEqual([
        dev.at(exampleSlug),
        "Signed in as the owner",
      ]);
      expect(journey.viewerId).toBe(journey.ownerId);
    });
  });
});
