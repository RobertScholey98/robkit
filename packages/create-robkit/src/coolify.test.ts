import { describe, expect, it } from "vitest";
import {
  deploy,
  readCoolifyConfig,
  type CoolifyConfig,
  type DeployOptions,
} from "./coolify.ts";
import type { Deployment } from "./deployment.ts";
import {
  fakeCoolify,
  fakeFetch,
  type FakeCoolify,
} from "./test/fake-coolify.ts";

const config: CoolifyConfig = {
  project: "robkit",
  environment: "production",
  server: "localhost",
  githubApp: "robkit-coolify",
  repository: "RobertScholey98/robkit-dev",
  branch: "main",
  domain: "robkit.dev",
};

const coolify = { url: "https://coolify.example", token: "t" };

const apps: Deployment[] = [
  {
    slug: "core",
    env: {
      ROBKIT_APP: { literal: "core" },
      DATABASE_URL: { shared: "CORE_DATABASE_URL" },
    },
  },
  { slug: "hub", env: { ROBKIT_APP: { literal: "hub" } } },
  {
    slug: "notes",
    env: {
      ROBKIT_APP: { literal: "notes" },
      DATABASE_URL: { shared: "NOTES_DATABASE_URL" },
    },
  },
];

/** An application Coolify already has for `slug`, as a sync made it. */
function existing(slug: string, uuid: string): Record<string, unknown> {
  return {
    uuid,
    name: `robkit-${slug}`,
    git_repository: "https://github.com/RobertScholey98/robkit-dev.git",
  };
}

async function run(
  state: FakeCoolify,
  affected: string[] | "all",
  options: Pick<DeployOptions, "requestTimeoutMs" | "timeoutMs"> = {},
): Promise<{ ok: boolean; log: string[] }> {
  const log: string[] = [];
  const ok = await deploy({
    coolify,
    config,
    deployments: apps,
    affected,
    fetch: fakeFetch(state),
    log: (line) => log.push(line),
    intervalMs: 0,
    ...options,
  });
  return { ok, log };
}

describe("readCoolifyConfig", () => {
  it("names a setting that's missing", () => {
    expect(() =>
      readCoolifyConfig(JSON.stringify({ ...config, githubApp: "" })),
    ).toThrow("coolify.json needs a non-empty string `githubApp`.");
  });

  it("reads a trusted proxy when the install sits behind Cloudflare", () => {
    expect(
      readCoolifyConfig(
        JSON.stringify({ ...config, trustedProxy: "cloudflare" }),
      ),
    ).toEqual({ ...config, trustedProxy: "cloudflare" });
    expect(readCoolifyConfig(JSON.stringify(config))).toEqual(config);
  });

  it("refuses a trusted proxy it doesn't know", () => {
    expect(() =>
      readCoolifyConfig(JSON.stringify({ ...config, trustedProxy: "traefik" })),
    ).toThrow(
      'coolify.json\'s `trustedProxy` must be "cloudflare" or left out.',
    );
  });
});

describe("deploy", () => {
  it("creates each app Coolify lacks from the one Dockerfile, with its variables", async () => {
    const state = fakeCoolify();

    await run(state, []);

    const created = state.requests.filter(
      ({ path }) => path === "/applications/private-github-app",
    );
    expect(created.map(({ body }) => body)).toContainEqual({
      project_uuid: "proj",
      server_uuid: "srv",
      github_app_uuid: "gh",
      environment_name: "production",
      instant_deploy: false,
      name: "robkit-notes",
      domains: "http://notes.robkit.dev",
      git_repository: "RobertScholey98/robkit-dev",
      git_branch: "main",
      build_pack: "dockerfile",
      base_directory: "/",
      dockerfile_location: "/Dockerfile",
      ports_exposes: "3000",
      health_check_enabled: false,
      is_auto_deploy_enabled: false,
      is_force_https_enabled: false,
    });
    const uuid = String(
      state.applications.find((app) => app.name === "robkit-notes")?.uuid,
    );
    expect([...(state.envs.get(uuid)?.values() ?? [])]).toEqual([
      {
        key: "ROBKIT_APP",
        value: "notes",
        is_buildtime: true,
        is_runtime: true,
      },
      {
        key: "DATABASE_URL",
        value: "{{environment.NOTES_DATABASE_URL}}",
        is_buildtime: false,
        is_runtime: true,
      },
    ]);
  });

  it("adopts an app Coolify already has rather than making another", async () => {
    const state = fakeCoolify({
      applications: [existing("notes", "old-notes")],
    });

    await run(state, []);

    expect(
      state.applications.filter((app) => app.name === "robkit-notes"),
    ).toHaveLength(1);
    expect(state.requests).toContainEqual(
      expect.objectContaining({
        method: "PATCH",
        path: "/applications/old-notes",
      }),
    );
  });

  it("deploys core first, then each affected app, and skips the rest", async () => {
    const state = fakeCoolify({
      applications: [
        existing("core", "c"),
        existing("hub", "h"),
        existing("notes", "n"),
      ],
    });

    const { ok, log } = await run(state, ["core", "notes"]);

    expect(ok).toBe(true);
    expect(
      state.requests
        .filter(({ path }) => path.startsWith("/deploy?"))
        .map(({ path }) => path),
    ).toEqual(["/deploy?uuid=c", "/deploy?uuid=n"]);
    expect(log).toContain("| hub | skip | unchanged |");
  });

  it("deploys a new app, and core with it, since the app catalog changed", async () => {
    const state = fakeCoolify({
      applications: [existing("core", "c"), existing("hub", "h")],
    });

    const { log } = await run(state, []);

    expect(log).toContain("| core | deploy | the app catalog changed |");
    expect(log).toContain("| notes | deploy | new on Coolify |");
    expect(
      state.requests
        .filter(({ path }) => path.startsWith("/deploy?"))
        .map(({ path }) => path),
    ).toEqual(["/deploy?uuid=c", "/deploy?uuid=app3"]);
  });

  it("stops before the other apps when core's deploy fails", async () => {
    const state = fakeCoolify({
      applications: [existing("core", "c"), existing("hub", "h")],
      outcomes: { c: "failed" },
    });

    const { ok, log } = await run(state, "all");

    expect(ok).toBe(false);
    expect(log).toContain("- core: failed, failed");
    expect(log).toContain("- hub: not started, an earlier deploy failed");
  });

  it("gives up on a request Coolify never answers", async () => {
    const state = fakeCoolify({
      answer: (route) => (route === "GET /servers" ? "hang" : undefined),
    });

    await expect(run(state, "all", { requestTimeoutMs: 20 })).rejects.toThrow(
      "GET /servers failed: no answer in 20 ms",
    );
  });

  it("stops waiting at its deadline, even while a request hangs", async () => {
    const state = fakeCoolify({
      applications: [existing("core", "c")],
      answer: (route) =>
        route.startsWith("GET /deployments/") ? "hang" : undefined,
    });

    const { ok, log } = await run(state, ["core"], { timeoutMs: 50 });

    expect(ok).toBe(false);
    expect(log).toContain("- core: failed, still queued after 50 ms");
  });
});
