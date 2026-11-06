import { describe, expect, it } from "vitest";
import type { CoolifyConfig } from "./coolify-config.ts";
import { deploy, type DeployOptions } from "./coolify-deploy.ts";
import type { AppDeployment } from "./deployment.ts";
import {
  fakeCoolify,
  fakeFetch,
  type FakeCoolify,
} from "./test/fake-coolify.ts";
import { slug } from "@internal/test-session";

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

const apps: AppDeployment[] = [
  {
    slug: "core",
    env: {
      ROBKIT_APP: { literal: "core" },
      DATABASE_URL: { shared: "CORE_DATABASE_URL" },
    },
  },
  { slug: "hub", env: { ROBKIT_APP: { literal: "hub" } } },
  {
    slug: slug("notes"),
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
  affected: readonly string[] | "all",
  options: Pick<DeployOptions, "requestTimeoutMs" | "timeoutMs"> = {},
): Promise<{ ok: boolean; log: string[] }> {
  const log: string[] = [];
  const ok = await deploy({
    coolify,
    config,
    deployments: apps,
    affected: affected === "all" ? "all" : affected.map(slug),
    fetch: fakeFetch(state),
    log: (line) => log.push(line),
    intervalMs: 0,
    ...options,
  });
  return { ok, log };
}

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
    expect(log).toContain(
      "- core: failed, failed. Check the deployment's log in Coolify.",
    );
    expect(log).toContain("- hub: not started, an earlier deploy failed");
  });

  it("gives up on a request Coolify never answers, and says what to check", async () => {
    const state = fakeCoolify({
      answer: (route) => (route === "GET /servers" ? "hang" : undefined),
    });

    await expect(run(state, "all", { requestTimeoutMs: 20 })).rejects.toThrow(
      "Couldn't read Coolify's servers: no answer in 20 ms. Check COOLIFY_URL and that Coolify is up.",
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
    expect(log).toContain(
      "- core: failed, still queued after 50 ms. Check the deployment's log in Coolify.",
    );
  });

  it("names the app, the step and what to check when Coolify refuses one", async () => {
    const state = fakeCoolify({
      applications: [existing("core", "c"), existing("hub", "h")],
      answer: (route) =>
        route === "PATCH /applications/h/envs/bulk"
          ? { status: 401, body: { message: "Unauthenticated." } }
          : undefined,
    });

    const { ok, log } = await run(state, "all");

    expect(ok).toBe(false);
    expect(log).toContain(
      '| hub | failed | saving its variables: HTTP 401 {"message":"Unauthenticated."}. Check COOLIFY_TOKEN, and that it may deploy. |',
    );
  });

  it("names a failed deployment and where to look", async () => {
    const state = fakeCoolify({
      applications: [existing("core", "c")],
      outcomes: { c: "failed" },
    });

    const { log } = await run(state, ["core"]);

    expect(log).toContain(
      "- core: failed, failed. Check the deployment's log in Coolify.",
    );
  });
});

describe("deploy's plan", () => {
  /** Every app Coolify already has, as a sync made them. */
  const all = () => [
    existing("core", "c"),
    existing("hub", "h"),
    existing("notes", "n"),
  ];

  const deploysOf = (state: FakeCoolify) =>
    state.requests
      .filter(({ path }) => path.startsWith("/deploy?"))
      .map(({ path }) => path);

  it("deploys nothing and logs only the plan when no app changed", async () => {
    const state = fakeCoolify({ applications: all() });

    const { ok, log } = await run(state, []);

    expect(ok).toBe(true);
    expect(deploysOf(state)).toEqual([]);
    expect(log).toEqual([
      "| App | Action | Detail |",
      "| --- | --- | --- |",
      "| core | skip | unchanged |",
      "| hub | skip | unchanged |",
      "| notes | skip | unchanged |",
    ]);
  });

  it("deploys the changed apps together when core is unchanged", async () => {
    const state = fakeCoolify({ applications: all() });

    const { ok, log } = await run(state, ["hub", "notes"]);

    expect(ok).toBe(true);
    expect(log).toContain("| core | skip | unchanged |");
    // One wave: both are queued before either is polled.
    expect(
      state.requests
        .map(({ method, path }) => `${method} ${path.split("?")[0] ?? ""}`)
        .filter((route) => /^(POST \/deploy|GET \/deployments)/.test(route))
        .slice(0, 2),
    ).toEqual(["POST /deploy", "POST /deploy"]);
    expect(deploysOf(state)).toEqual(["/deploy?uuid=h", "/deploy?uuid=n"]);
    expect(log.slice(-2)).toEqual([
      "- hub: deployed, finished",
      "- notes: deployed, finished",
    ]);
  });

  it("deploys every app with all, core first", async () => {
    const state = fakeCoolify({ applications: all() });

    const { ok } = await run(state, "all");

    expect(ok).toBe(true);
    expect(deploysOf(state)).toEqual([
      "/deploy?uuid=c",
      "/deploy?uuid=h",
      "/deploy?uuid=n",
    ]);
  });

  it("still deploys the others when one app fails to sync, and reports failure", async () => {
    const state = fakeCoolify({
      applications: all(),
      answer: (route) =>
        route === "PATCH /applications/h"
          ? { status: 500, body: { message: "Server Error" } }
          : undefined,
    });

    const { ok, log } = await run(state, "all");

    expect(ok).toBe(false);
    expect(log).toContain(
      `| hub | failed | updating it: HTTP 500 {"message":"Server Error"}. Check Coolify's own log. |`,
    );
    expect(deploysOf(state)).toEqual(["/deploy?uuid=c", "/deploy?uuid=n"]);
  });
});

describe("deploy's lookups", () => {
  it("refuses two Coolify applications with one app's name", async () => {
    const state = fakeCoolify({
      applications: [existing("hub", "h1"), existing("hub", "h2")],
    });

    await expect(run(state, [])).rejects.toThrow(
      "2 Coolify applications are named robkit-hub. Delete the extras.",
    );
  });

  it("names the server it can't find, and those it found", async () => {
    const state = fakeCoolify({
      servers: [
        { uuid: "a", name: "alpha" },
        { uuid: "b", name: "beta" },
      ],
    });

    await expect(run(state, [])).rejects.toThrow(
      "No Coolify server named localhost. Found: alpha, beta.",
    );
  });

  it("takes Coolify's only server, whatever its name", async () => {
    const state = fakeCoolify({ servers: [{ uuid: "only", name: "box" }] });

    await run(state, []);

    expect(
      state.requests
        .filter(({ path }) => path === "/applications/private-github-app")
        .map(({ body }) => (body as { server_uuid: string }).server_uuid),
    ).toEqual(["only", "only", "only"]);
  });
});

describe("deploy's failures", () => {
  it("names the app when Coolify won't create it", async () => {
    const state = fakeCoolify({
      answer: (route) =>
        route === "POST /applications/private-github-app"
          ? { status: 201, body: {} }
          : undefined,
    });

    const { ok, log } = await run(state, []);

    expect(ok).toBe(false);
    expect(log).toContain(
      "| notes | failed | creating it: Coolify returned no uuid. Check Coolify's own log. |",
    );
  });

  it("says what to check when Cloudflare Access turns a call away", async () => {
    const state = fakeCoolify({
      applications: [existing("core", "c")],
      answer: (route) =>
        route === "POST /deploy" ? { status: 302, body: "" } : undefined,
    });

    const { ok, log } = await run(state, ["core"]);

    expect(ok).toBe(false);
    expect(log).toContain(
      '- core: failed, queueing its deploy: HTTP 302 "". Check CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET: Cloudflare Access sends a token it refuses to its login page.',
    );
  });

  it("says when Coolify queued nothing", async () => {
    const state = fakeCoolify({
      applications: [existing("core", "c")],
      answer: (route) =>
        route === "POST /deploy"
          ? {
              status: 200,
              body: { deployments: [{ message: "nothing to deploy" }] },
            }
          : undefined,
    });

    const { log } = await run(state, ["core"]);

    expect(log).toContain(
      "- core: failed, Coolify queued nothing: nothing to deploy. Check Coolify's own log.",
    );
  });

  it("gives up on a deployment it can't read three times running", async () => {
    const state = fakeCoolify({
      applications: [existing("core", "c")],
      answer: (route) =>
        route.startsWith("GET /deployments/")
          ? { status: 500, body: { message: "Server Error" } }
          : undefined,
    });

    const { log } = await run(state, ["core"]);

    expect(log).toContain(
      `- core: failed, lost track of dep-c: HTTP 500 {"message":"Server Error"}. Check Coolify's own log.`,
    );
  });

  it("names a deployment someone cancelled", async () => {
    const state = fakeCoolify({
      applications: [existing("core", "c")],
      outcomes: { c: "cancelled-by-user" },
    });

    const { log } = await run(state, ["core"]);

    expect(log).toContain(
      "- core: failed, cancelled-by-user. Check the deployment's log in Coolify.",
    );
  });
});
