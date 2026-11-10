import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from "next/constants.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withRobkit } from "./config.ts";

/** This checkout, which a linked install takes @robkit/next from. */
const checkout = fileURLToPath(new URL("../../../", import.meta.url)).replace(
  /[\\/]$/,
  "",
);
const adapter = fileURLToPath(new URL("../", import.meta.url));
const startedIn = process.cwd();

/**
 * An app folder whose `node_modules/@robkit/next` links to `target`, as
 * pnpm lays one out, and the test run from it.
 */
async function runFromApp(target: string): Promise<void> {
  const app = await mkdtemp(join(tmpdir(), "robkit-next-app-"));
  await mkdir(join(app, "node_modules", "@robkit"), { recursive: true });
  await symlink(
    target,
    join(app, "node_modules", "@robkit", "next"),
    "junction",
  );
  afterEachCleanup.push(() => rm(app, { recursive: true, force: true }));
  process.chdir(app);
}

const afterEachCleanup: (() => Promise<void>)[] = [];

beforeEach(async () => {
  vi.stubEnv("NEXT_TELEMETRY_DISABLED", undefined);
  vi.stubEnv("ROBKIT_APP", "notes");
  vi.stubEnv("ROBKIT_CORE_URL", "http://core.robkit.localhost:3000");
  vi.stubEnv("ROBKIT_DOMAIN", "robkit.localhost");
  vi.stubEnv("PORT", "3004");
  // A linked install's, unless a test says otherwise.
  await runFromApp(adapter);
});

afterEach(async () => {
  process.chdir(startedIn);
  vi.unstubAllEnvs();
  await Promise.all(afterEachCleanup.splice(0).map((clean) => clean()));
});

describe("withRobkit()", () => {
  it("gives next dev the build in dist, the proxy's host and the linked checkout", () => {
    expect(withRobkit()(PHASE_DEVELOPMENT_SERVER)).toEqual({
      distDir: "dist",
      allowedDevOrigins: ["robkit.localhost", "*.robkit.localhost"],
      agentRules: false,
      experimental: {
        turbopackAdditionalRoots: { robkit: { path: checkout } },
      },
    });
  });

  it.each(["ROBKIT_APP", "ROBKIT_CORE_URL"])(
    "fails as next dev starts when %s is missing, naming it",
    (name) => {
      vi.stubEnv(name, undefined);

      expect(() => withRobkit()(PHASE_DEVELOPMENT_SERVER)).toThrow(
        `${name} is not set.`,
      );
    },
  );

  it("builds with no guard settings, and with telemetry off", () => {
    vi.stubEnv("ROBKIT_APP", undefined);
    vi.stubEnv("ROBKIT_CORE_URL", undefined);
    vi.stubEnv("ROBKIT_DOMAIN", undefined);

    expect(withRobkit()(PHASE_PRODUCTION_BUILD)).toEqual({
      distDir: "dist",
      agentRules: false,
      experimental: {
        turbopackAdditionalRoots: { robkit: { path: checkout } },
      },
    });
    expect(process.env.NEXT_TELEMETRY_DISABLED).toBe("1");
  });

  it("adds no root when @robkit/next came from a registry", async () => {
    const installed = join(
      await mkdtemp(join(tmpdir(), "robkit-next-npm-")),
      "node_modules",
      "@robkit",
      "next",
    );
    await mkdir(installed, { recursive: true });
    afterEachCleanup.push(() =>
      rm(dirname(dirname(dirname(installed))), {
        recursive: true,
        force: true,
      }),
    );
    await runFromApp(await realpath(installed));

    expect(withRobkit()(PHASE_PRODUCTION_BUILD)).toEqual({
      distDir: "dist",
      agentRules: false,
    });
  });

  it("reads nothing for the production server, which builds nothing", () => {
    vi.stubEnv("PORT", "not a port");
    vi.stubEnv("ROBKIT_APP", undefined);
    process.chdir(tmpdir());

    expect(withRobkit()(PHASE_PRODUCTION_SERVER)).toEqual({
      distDir: "dist",
      agentRules: false,
    });
  });

  it("keeps the app's own settings beside robkit's", () => {
    const config = withRobkit({
      reactStrictMode: true,
      allowedDevOrigins: ["notes.example.test"],
      experimental: {
        turbopackAdditionalRoots: { shared: { path: "/srv/shared" } },
      },
    });

    expect(config(PHASE_DEVELOPMENT_SERVER)).toEqual({
      reactStrictMode: true,
      distDir: "dist",
      allowedDevOrigins: [
        "notes.example.test",
        "robkit.localhost",
        "*.robkit.localhost",
      ],
      agentRules: false,
      experimental: {
        turbopackAdditionalRoots: {
          shared: { path: "/srv/shared" },
          robkit: { path: checkout },
        },
      },
    });
  });
});
