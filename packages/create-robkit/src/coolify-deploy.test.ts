import { describe, expect, it } from "vitest";
import { isRecord } from "@robkit/input";
import { slug, aDomain } from "@internal/test-session";
import type { Changes, History } from "./affected-apps.ts";
import type { CoolifyConfig } from "./coolify-config.ts";
import { deploy, type Choice, type DeployOptions } from "./coolify-deploy.ts";
import type { AppDeployment } from "./deployment.ts";
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
  domain: aDomain("robkit.dev"),
};

const coolify = { url: "https://coolify.example", token: "t" };

/** Commits in the order they were pushed. Each run deploys from `head` unless a test says otherwise. */
const earlier = "0".repeat(40);
const middle = "5".repeat(40);
const later = "9".repeat(40);
const head = "a".repeat(40);

/** hub's record after a deploy from `head`: its one variable, ROBKIT_APP=hub. */
const hubRecord = `robkit deployed commit ${head} with variables 3811fd08b3de6852509f6f4bd104c62283533ce1457a7745d981ffcce8418272`;

/** The install: core, the hub, and notes, whose database core provisions. */
const apps: AppDeployment[] = [
  {
    slug: "core",
    env: {
      ROBKIT_APP: { literal: "core" },
      DATABASE_URL: { shared: "CORE_DATABASE_URL" },
      ROBKIT_DATABASES: { literal: "core,notes" },
      ROBKIT_ADMIN_DATABASE_URL: { shared: "ROBKIT_ADMIN_DATABASE_URL" },
      ROBKIT_DB_SECRET: { shared: "ROBKIT_DB_SECRET" },
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

/** The install before notes had a `migrate` script. */
const beforeNotesMigrated: AppDeployment[] = [
  {
    slug: "core",
    env: { ...apps[0]?.env, ROBKIT_DATABASES: { literal: "core" } },
  },
  { slug: "hub", env: { ROBKIT_APP: { literal: "hub" } } },
  { slug: slug("notes"), env: { ROBKIT_APP: { literal: "notes" } } },
];

/**
 * A Coolify with the shared variables the apps refer to, each holding a
 * value no output may show.
 */
function host(overrides: Partial<FakeCoolify> = {}): FakeCoolify {
  return fakeCoolify({
    sharedVariables: {
      CORE_DATABASE_URL: "postgres://core:secret-core@db/robkit",
      NOTES_DATABASE_URL: "postgres://notes:secret-notes@db/robkit",
      ROBKIT_ADMIN_DATABASE_URL: "postgres://postgres:secret-admin@db/robkit",
      ROBKIT_DB_SECRET: "secret-of-the-install",
    },
    ...overrides,
  });
}

/** An application Coolify already has for `slug`, as a sync made it. */
function existing(slug: string, uuid: string): Record<string, unknown> {
  return {
    uuid,
    name: `robkit-${slug}`,
    git_repository: "https://github.com/RobertScholey98/robkit-dev.git",
    environment_id: 1,
  };
}

/** Every app Coolify already has, as a sync made them. */
const all = () => [
  existing("core", "c"),
  existing("hub", "h"),
  existing("notes", "n"),
];

/**
 * A checkout at `at`, in which `changed` lists the apps changed since each
 * commit, or says the commit is gone. It notes each commit it is asked
 * about.
 */
function checkout(
  at: string,
  changed: Record<string, readonly string[] | "gone"> = {},
): History & { asked: string[] } {
  const asked: string[] = [];
  return {
    head: at,
    asked,
    changedSince: (commit) => {
      asked.push(commit);
      const found = changed[commit] ?? [];
      return Promise.resolve<Changes>(
        found === "gone"
          ? { outcome: "not-in-history" }
          : { outcome: "changed", apps: found.map(slug) },
      );
    },
  };
}

interface RunOptions extends Pick<
  DeployOptions,
  "requestTimeoutMs" | "timeoutMs" | "dryRun"
> {
  history?: History;
  deployments?: AppDeployment[];
  /**
   * What Coolify says it built: the commit the branch held as each build
   * started. The checkout's own commit unless a test says otherwise.
   */
  built?: string;
}

async function run(
  state: FakeCoolify,
  choice: "changed" | "all" | readonly string[],
  {
    history = checkout(head),
    deployments = apps,
    built = history.head,
    ...options
  }: RunOptions = {},
): Promise<{ ok: boolean; log: string[] }> {
  state.branch = built;
  const log: string[] = [];
  const chosen: Choice =
    choice === "changed" || choice === "all" ? choice : choice.map(slug);
  const ok = await deploy({
    coolify,
    config,
    deployments,
    apps: chosen,
    history,
    fetch: fakeFetch(state),
    log: (line) => log.push(line),
    intervalMs: 0,
    ...options,
  });
  return { ok, log };
}

/**
 * Deploys every app once from `earlier`, so each has a record, then forgets
 * the requests that took.
 */
async function deployedOnce(
  state: FakeCoolify,
  deployments: AppDeployment[] = apps,
): Promise<void> {
  const { ok } = await run(state, "all", {
    history: checkout(earlier),
    deployments,
  });
  expect(ok).toBe(true);
  state.requests.length = 0;
}

const deploysOf = (state: FakeCoolify) =>
  state.requests
    .filter(({ path }) => path.startsWith("/deploy?"))
    .map(({ path }) => path);

const recordOn = (state: FakeCoolify, uuid: string) =>
  state.applications.find((app) => app.uuid === uuid)?.description;

/** The variables Coolify holds for an application, by name. */
const savedOn = (state: FakeCoolify, uuid: string): Record<string, unknown> =>
  Object.fromEntries(
    [...(state.envs.get(uuid)?.values() ?? [])].map(({ key, value }) => [
      String(key),
      value,
    ]),
  );

describe("deploy", () => {
  it("creates each app Coolify lacks from the one Dockerfile, with its variables", async () => {
    const state = host();

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
    const state = host({
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

  it("leaves alone an application in another environment with an app's name", async () => {
    const staging = {
      ...existing("notes", "staging-notes"),
      environment_id: 2,
    };
    const state = host({
      environments: [
        { id: 1, uuid: "env-production", name: "production" },
        { id: 2, uuid: "env-staging", name: "staging" },
      ],
      applications: [existing("core", "c"), existing("hub", "h"), staging],
    });

    const { log } = await run(state, "all");

    expect(
      state.requests.filter(({ path }) => path.includes("staging-notes")),
    ).toEqual([]);
    expect(log.join("\n")).not.toContain("staging-notes");
    expect(
      state.applications
        .filter(({ name }) => name === "robkit-notes")
        .map(({ uuid, environment_id }) => [uuid, environment_id]),
    ).toEqual([
      ["staging-notes", 2],
      ["app4", 1],
    ]);
  });

  it("sends no request that removes or replaces a variable the owner set on the host", async () => {
    const ownerSet = {
      key: "NOTES_API_KEY",
      value: "the owner's",
      is_buildtime: false,
      is_runtime: true,
    };
    const state = host({
      applications: [
        existing("core", "c"),
        existing("hub", "h"),
        existing("notes", "n"),
      ],
      envs: new Map([["n", new Map([[ownerSet.key, ownerSet]])]]),
    });

    await run(state, "all");

    // Only the bulk route sends variables, and it only adds or updates the
    // ones it names: Coolify's API removes a variable by DELETE alone.
    expect(state.requests.map(({ method }) => method)).not.toContain("DELETE");
    const sent = state.requests.flatMap(({ path, body }) =>
      path.endsWith("/envs/bulk")
        ? (body as { data: { key: string }[] }).data.map(({ key }) => key)
        : [],
    );
    const robkitSets = new Set(apps.flatMap(({ env }) => Object.keys(env)));
    expect(sent.filter((key) => !robkitSets.has(key))).toEqual([]);
    expect(state.envs.get("n")?.get(ownerSet.key)).toEqual(ownerSet);
  });

  it("deploys core first, then each affected app, and skips the rest", async () => {
    const state = host({
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
    expect(log).toContain("| hub | skip | not named with --apps |");
  });

  it("stops before the other apps when core's deploy fails", async () => {
    const state = host({
      applications: [existing("core", "c"), existing("hub", "h")],
      outcomes: { c: "failed" },
    });

    const { ok, log } = await run(state, "all");

    expect(ok).toBe(false);
    expect(log).toContain(
      "- core: failed, failed. Check the deployment's log in Coolify.",
    );
    expect(log).toContain("- hub: held back, since core didn't deploy");
    expect(deploysOf(state)).toEqual(["/deploy?uuid=c"]);
  });

  it("holds every app back when core's settings can't be saved", async () => {
    const state = host({
      applications: all(),
      answer: (route) =>
        route === "PATCH /applications/c/envs/bulk"
          ? { status: 500, body: { message: "Server Error" } }
          : undefined,
    });

    const { ok, log } = await run(state, "all");

    expect(ok).toBe(false);
    expect(deploysOf(state)).toEqual([]);
    expect(log.slice(-2)).toEqual([
      "- hub: held back, since core didn't deploy",
      "- notes: held back, since core didn't deploy",
    ]);
  });

  it("gives up on a request Coolify never answers, and says what to check", async () => {
    const state = host({
      answer: (route) => (route === "GET /servers" ? "hang" : undefined),
    });

    await expect(run(state, "all", { requestTimeoutMs: 20 })).rejects.toThrow(
      "Couldn't read Coolify's servers: no answer in 20 ms. Check COOLIFY_URL and that Coolify is up.",
    );
  });

  it("stops waiting at its deadline, even while a request hangs", async () => {
    const state = host({
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
    const state = host({
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
    const state = host({
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
  it("deploys nothing and logs only the plan when no app changed since its record", async () => {
    const state = host({ applications: all() });
    await deployedOnce(state);
    const history = checkout(head);

    const { ok, log } = await run(state, "changed", { history });

    expect(ok).toBe(true);
    expect(deploysOf(state)).toEqual([]);
    expect(history.asked).toEqual([earlier]);
    expect(log).toEqual([
      "| App | Action | Detail |",
      "| --- | --- | --- |",
      "| core | skip | unchanged since 0000000 |",
      "| hub | skip | unchanged since 0000000 |",
      "| notes | skip | unchanged since 0000000 |",
    ]);
  });

  it("deploys the apps changed since their record together when core is unchanged", async () => {
    const state = host({ applications: all() });
    await deployedOnce(state);

    const { ok, log } = await run(state, "changed", {
      history: checkout(head, { [earlier]: ["hub", "notes"] }),
    });

    expect(ok).toBe(true);
    expect(log).toContain("| core | skip | unchanged since 0000000 |");
    expect(log).toContain("| hub | deploy | changed since 0000000 |");
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
    const state = host({ applications: all() });

    const { ok, log } = await run(state, "all");

    expect(ok).toBe(true);
    expect(log).toContain("| hub | deploy | --all |");
    expect(deploysOf(state)).toEqual([
      "/deploy?uuid=c",
      "/deploy?uuid=h",
      "/deploy?uuid=n",
    ]);
  });

  it("deploys the apps named with --apps, and core when its record doesn't show its variables", async () => {
    const state = host({ applications: all() });
    await deployedOnce(state, beforeNotesMigrated);

    const { log } = await run(state, ["hub"]);

    expect(log).toContain(
      "| core | deploy | its variables changed since 0000000 |",
    );
    expect(log).toContain("| hub | deploy | named with --apps |");
    expect(log).toContain("| notes | skip | not named with --apps |");
    expect(deploysOf(state)).toEqual(["/deploy?uuid=c", "/deploy?uuid=h"]);
  });

  it("still deploys the others when one app fails to sync, and reports failure", async () => {
    const state = host({
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

describe("deploy's dry run", () => {
  it("names each app's action and reason, and sends Coolify no write", async () => {
    const state = host({
      applications: [
        existing("core", "c"),
        existing("hub", "h"),
        existing("blog", "b"),
      ],
    });
    await deployedOnce(state, beforeNotesMigrated.slice(0, 2));
    const before = structuredClone(state.applications);

    const { ok, log } = await run(state, "changed", {
      dryRun: true,
      history: checkout(head, { [earlier]: ["hub"] }),
    });

    expect(ok).toBe(true);
    expect(log).toEqual([
      "| App | Action | Detail |",
      "| --- | --- | --- |",
      "| core | deploy | its variables changed since 0000000 |",
      "| hub | deploy | changed since 0000000 |",
      "| notes | deploy | new on Coolify |",
      `- robkit-blog matches no app in this install, so robkit deploy left it alone. To remove it, see "Removing an app's application" in docs/deploy.md.`,
      "This was a dry run, so nothing was written to Coolify.",
    ]);
    expect(new Set(state.requests.map(({ method }) => method))).toEqual(
      new Set(["GET"]),
    );
    expect(state.applications).toEqual(before);
  });

  it("stops at a missing shared variable, as a deploy does", async () => {
    const state = host({ sharedVariables: {} });

    await expect(run(state, "changed", { dryRun: true })).rejects.toThrow(
      "lacks shared variables the apps need",
    );
  });
});

describe("deploy's decisions", () => {
  it("asks turbo once for each distinct recorded commit", async () => {
    const state = host({ applications: all() });
    await deployedOnce(state);
    await run(state, ["hub"], {
      history: checkout(middle, { [earlier]: ["hub"] }),
    });
    const history = checkout(head, { [middle]: ["hub"] });

    const { log } = await run(state, "changed", { history });

    expect(history.asked.sort()).toEqual([earlier, middle]);
    expect(log).toContain("| hub | deploy | changed since 5555555 |");
    expect(log).toContain("| notes | skip | unchanged since 0000000 |");
  });

  it("deploys an app with no record, and one whose record it can't read", async () => {
    const state = host({ applications: all() });
    await deployedOnce(state);
    const [, hub, notes] = state.applications;
    if (hub) hub.description = "";
    if (notes) notes.description = "Notes, by the owner";

    const { log } = await run(state, "changed");

    expect(log).toContain("| core | skip | unchanged since 0000000 |");
    expect(log).toContain("| hub | deploy | no record of a finished deploy |");
    expect(log).toContain("| notes | deploy | its record can't be read |");
  });

  it("deploys each app whose recorded commit is no longer in history, as after a force push", async () => {
    const state = host({ applications: all() });
    await deployedOnce(state);

    const { log } = await run(state, "changed", {
      history: checkout(head, { [earlier]: "gone" }),
    });

    expect(log).toContain(
      "| hub | deploy | 0000000 is no longer in the branch's history |",
    );
    expect(deploysOf(state)).toEqual([
      "/deploy?uuid=c",
      "/deploy?uuid=h",
      "/deploy?uuid=n",
    ]);
  });

  it("deploys core when an app gains a migrate script, since core's variables change", async () => {
    const state = host({ applications: all() });
    await deployedOnce(state, beforeNotesMigrated);

    const { log } = await run(state, "changed");

    expect(log).toContain(
      "| core | deploy | its variables changed since 0000000 |",
    );
    expect(log).toContain(
      "| notes | deploy | its variables changed since 0000000 |",
    );
    expect(log).toContain("| hub | skip | unchanged since 0000000 |");
    expect(savedOn(state, "c").ROBKIT_DATABASES).toBe("core,notes");
  });

  it("deploys a new app, and core with it, since core's variables name it", async () => {
    const state = host({
      applications: [existing("core", "c"), existing("hub", "h")],
    });
    await deployedOnce(state, beforeNotesMigrated.slice(0, 2));

    const { log } = await run(state, "changed");

    expect(log).toContain(
      "| core | deploy | its variables changed since 0000000 |",
    );
    expect(log).toContain("| notes | deploy | new on Coolify |");
    expect(deploysOf(state)).toEqual(["/deploy?uuid=c", "/deploy?uuid=app3"]);
  });

  it("deploys core on the re-run after its first deploy failed", async () => {
    const state = host({ outcomes: { app1: "failed" } });
    await run(state, "changed");
    state.outcomes = {};

    const { ok, log } = await run(state, "changed");

    expect(ok).toBe(true);
    expect(log).toContain("| core | deploy | no record of a finished deploy |");
    expect(log).toContain("- core: deployed, finished");
    // Core gives notes its database and role as it starts.
    expect(savedOn(state, "app1").ROBKIT_DATABASES).toBe("core,notes");
  });

  it("deploys core again when its last deploy failed after its variables were saved", async () => {
    const state = host({ applications: all() });
    await deployedOnce(state, beforeNotesMigrated);
    state.outcomes = { c: "failed" };
    await run(state, "changed");
    state.outcomes = {};

    const { log } = await run(state, "changed");

    expect(log).toContain("| core | deploy | no record of a finished deploy |");
    expect(log).toContain("- core: deployed, finished");
  });

  it("deploys what a push changed on the next push, when the push's own run failed", async () => {
    const state = host({ applications: all() });
    await deployedOnce(state);
    state.outcomes = { n: "failed" };
    await run(state, "changed", {
      history: checkout(middle, { [earlier]: ["notes"] }),
    });
    state.outcomes = {};

    const { log } = await run(state, "changed", {
      history: checkout(head, { [earlier]: ["notes"], [middle]: [] }),
    });

    expect(log).toContain(
      "| notes | deploy | no record of a finished deploy |",
    );
    expect(deploysOf(state).at(-1)).toBe("/deploy?uuid=n");
  });

  it("deploys an app again after a deploy that failed, even when the next push puts its code back", async () => {
    const state = host({ applications: all() });
    await deployedOnce(state);
    // `middle` changed notes, and robkit gave up on its deploy. Coolify may
    // have finished it since, so nothing says which code notes runs.
    state.outcomes = { n: "failed" };
    await run(state, "changed", {
      history: checkout(middle, { [earlier]: ["notes"] }),
    });
    state.outcomes = {};
    state.requests.length = 0;

    // `head` puts notes back as it was at `earlier`.
    const { log } = await run(state, "changed", {
      history: checkout(head, { [earlier]: [], [middle]: ["notes"] }),
    });

    expect(log).toContain(
      "| notes | deploy | no record of a finished deploy |",
    );
    expect(deploysOf(state)).toEqual(["/deploy?uuid=n"]);
  });

  it("deploys an app again when the branch moved during its deploy, and leaves core's variables matching the newer push", async () => {
    const state = host({ applications: all() });
    await deployedOnce(state, beforeNotesMigrated);
    // While this run deployed notes from `middle`, `head` gave notes a
    // migrate script, and Coolify built what the branch held by then.
    await run(state, "changed", {
      history: checkout(middle, { [earlier]: ["notes"] }),
      deployments: beforeNotesMigrated,
    });
    state.requests.length = 0;

    const { log } = await run(state, "changed", {
      history: checkout(head, { [middle]: ["notes"], [earlier]: [] }),
    });

    expect(log).toContain(
      "| notes | deploy | its variables changed since 5555555 |",
    );
    expect(log).toContain(
      "| core | deploy | its variables changed since 0000000 |",
    );
    expect(savedOn(state, "c").ROBKIT_DATABASES).toBe("core,notes");
    expect(recordOn(state, "n")).toMatch(/^robkit deployed commit a{40} /);
  });

  it("deploys an app again when the branch moved during its deploy, even when the next push puts its code back", async () => {
    const state = host({ applications: all() });
    await deployedOnce(state);
    // While this run deployed notes from `middle`, `later` changed notes
    // again, and Coolify built what the branch held by then.
    const moved = await run(state, "changed", {
      history: checkout(middle, { [earlier]: ["notes"] }),
      built: later,
    });
    state.requests.length = 0;

    // `head` puts notes back as `middle` had it.
    const { log } = await run(state, "changed", {
      history: checkout(head, { [middle]: [], [later]: ["notes"] }),
    });

    expect(moved.log).toContain(
      "- notes: deployed, finished. Coolify built 9999999, where the branch was by then",
    );
    expect(log).toContain("| notes | deploy | changed since 9999999 |");
    expect(deploysOf(state)).toEqual(["/deploy?uuid=n"]);
  });
});

describe("deploy's applications that match no app", () => {
  const gone =
    '- robkit-notes matches no app in this install, so robkit deploy left it alone. To remove it, see "Removing an app\'s application" in docs/deploy.md.';

  it("deploys core with the shorter catalog when an app's folder is deleted, and names the app's application", async () => {
    const state = host({ applications: all() });
    await deployedOnce(state, beforeNotesMigrated);
    // Core's catalog no longer names notes.
    const [core, hub] = beforeNotesMigrated;
    const withoutNotes: AppDeployment[] = [
      { slug: "core", env: { ...core?.env, ROBKIT_APPS: { literal: "[]" } } },
      ...(hub ? [hub] : []),
    ];

    const { ok, log } = await run(state, "changed", {
      deployments: withoutNotes,
    });

    expect(ok).toBe(true);
    expect(log).toContain(
      "| core | deploy | its variables changed since 0000000 |",
    );
    expect(log).toContain(gone);
    expect(
      state.requests.filter(({ path }) => path.includes("/applications/n")),
    ).toEqual([]);
  });

  it("names none from another environment or another repository", async () => {
    const state = host({
      environments: [
        { id: 1, uuid: "env-production", name: "production" },
        { id: 2, uuid: "env-staging", name: "staging" },
      ],
      applications: [
        existing("core", "c"),
        existing("hub", "h"),
        { ...existing("notes", "staging-notes"), environment_id: 2 },
        {
          ...existing("blog", "owners-blog"),
          git_repository: "https://github.com/RobertScholey98/blog.git",
        },
      ],
    });

    const { log } = await run(state, "all", {
      deployments: beforeNotesMigrated.slice(0, 2),
    });

    expect(log.filter((line) => line.includes("matches no app"))).toEqual([]);
  });
});

describe("deploy's record", () => {
  /** What hub's description says from before its deploy is queued. */
  const hubStarted = `robkit started a deploy from commit ${head}`;

  it("takes the last record away before the deploy, then saves the commit and the variables once it finished", async () => {
    const state = host({ applications: all() });
    await deployedOnce(state);

    const { ok } = await run(state, ["hub"]);

    expect(ok).toBe(true);
    expect(recordOn(state, "h")).toBe(hubRecord);
    const recorded = state.requests.flatMap(({ method, path, body }, at) =>
      isRecord(body) && "description" in body
        ? [{ method, path, at, description: body.description }]
        : [],
    );
    const queued = state.requests.findIndex(
      ({ path }) => path === "/deploy?uuid=h",
    );
    const finished = state.requests.findIndex(
      ({ path }) => path === "/deployments/dep-h",
    );
    expect(recorded).toEqual([
      {
        method: "PATCH",
        path: "/applications/h",
        at: queued - 1,
        description: hubStarted,
      },
      {
        method: "PATCH",
        path: "/applications/h",
        at: finished + 1,
        description: hubRecord,
      },
    ]);
  });

  it.each(["failed", "cancelled-by-user"])(
    "leaves no record of a finished deploy when the deploy ends %s",
    async (outcome) => {
      const state = host({ applications: all() });
      await deployedOnce(state);
      state.outcomes = { h: outcome };

      const { ok } = await run(state, ["hub"]);

      expect(ok).toBe(false);
      expect(recordOn(state, "h")).toBe(hubStarted);
    },
  );

  it("leaves no record of a finished deploy when the deploy runs out of time", async () => {
    const state = host({ applications: all() });
    await deployedOnce(state);
    state.answer = (route) =>
      route.startsWith("GET /deployments/") ? "hang" : undefined;

    const { ok } = await run(state, ["hub"], { timeoutMs: 50 });

    expect(ok).toBe(false);
    expect(recordOn(state, "h")).toBe(hubStarted);
  });

  it("queues no deploy when the last record can't be taken away first", async () => {
    const state = host({ applications: all() });
    await deployedOnce(state);
    const before = recordOn(state, "h");
    // The app's settings are saved first, with no description among them.
    state.answer = (route) => {
      const body = state.requests.at(-1)?.body;
      return route === "PATCH /applications/h" &&
        isRecord(body) &&
        "description" in body
        ? { status: 500, body: { message: "Server Error" } }
        : undefined;
    };

    const { ok, log } = await run(state, ["hub"]);

    expect(ok).toBe(false);
    expect(log).toContain(
      `- hub: failed, taking its last record away before the deploy: HTTP 500 {"message":"Server Error"}. Check Coolify's own log.`,
    );
    expect(deploysOf(state)).toEqual([]);
    expect(recordOn(state, "h")).toBe(before);
  });

  it.each([
    // A deployment whose commit Coolify never resolved.
    ["still says HEAD", { status: "finished", commit: "HEAD" }],
    ["names no commit", { status: "finished" }],
  ])(
    "deploys, but saves no record, when the finished deployment %s",
    async (_, deployment) => {
      const state = host({ applications: all() });
      await deployedOnce(state);
      state.answer = (route) =>
        route === "GET /deployments/dep-h"
          ? { status: 200, body: deployment }
          : undefined;

      const { ok, log } = await run(state, ["hub"]);

      expect(ok).toBe(true);
      expect(log).toContain(
        "- hub: deployed, but Coolify didn't say which commit it built, so the next deploy deploys it again",
      );
      expect(recordOn(state, "h")).toBe(hubStarted);
    },
  );

  it("reads the commit Coolify built in any case of letters", async () => {
    const state = host({ applications: all() });
    await deployedOnce(state);

    await run(state, ["hub"], { built: head.toUpperCase() });

    expect(recordOn(state, "h")).toBe(hubRecord);
  });

  it("fails, and says the next deploy deploys the app again, when the record can't be saved", async () => {
    const state = host({ applications: [existing("hub", "h")] });
    let deployed = false;
    state.answer = (route) => {
      if (route === "GET /deployments/dep-h") deployed = true;
      return deployed && route === "PATCH /applications/h"
        ? { status: 500, body: { message: "Server Error" } }
        : undefined;
    };

    const { ok, log } = await run(state, ["hub"]);

    expect(ok).toBe(false);
    expect(log).toContain(
      `- hub: deployed, but its record wasn't saved, so the next deploy deploys it again: HTTP 500 {"message":"Server Error"}. Check Coolify's own log.`,
    );
    expect(recordOn(state, "h")).toBe(hubStarted);
  });

  it("deploys an app again after its record wasn't saved, even when the next push puts its code back", async () => {
    const state = host({ applications: all() });
    await deployedOnce(state);
    // `middle` changed notes. Its deploy finished, and saving its record
    // failed.
    let deployed = false;
    state.answer = (route) => {
      if (route === "GET /deployments/dep-n") deployed = true;
      return deployed && route === "PATCH /applications/n"
        ? { status: 500, body: { message: "Server Error" } }
        : undefined;
    };
    await run(state, "changed", {
      history: checkout(middle, { [earlier]: ["notes"] }),
    });
    delete state.answer;
    state.requests.length = 0;

    // `head` puts notes back as it was at `earlier`.
    const { log } = await run(state, "changed", {
      history: checkout(head, { [earlier]: [], [middle]: ["notes"] }),
    });

    expect(log).toContain(
      "| notes | deploy | no record of a finished deploy |",
    );
    expect(deploysOf(state)).toEqual(["/deploy?uuid=n"]);
  });
});

describe("deploy's shared variables", () => {
  it("names each one the host lacks, shows no value and writes nothing", async () => {
    const state = host({
      sharedVariables: {
        CORE_DATABASE_URL: "postgres://core:secret-core@db/robkit",
      },
    });

    const failed = run(state, "all");

    await expect(failed).rejects.toThrow(
      [
        "Coolify's production environment lacks shared variables the apps need, so nothing was deployed:",
        "- ROBKIT_ADMIN_DATABASE_URL: the internal URL of the environment's PostgreSQL resource, from step 3 of the one-time setup in docs/deploy.md.",
        "- ROBKIT_DB_SECRET: the install's database secret, from step 4 of the one-time setup in docs/deploy.md.",
        "- NOTES_DATABASE_URL: pnpm robkit database-urls prints it.",
        "Add each to the environment's shared variables in Coolify, then deploy again.",
      ].join(String.fromCharCode(10)),
    );
    const message = String(await failed.catch((error: unknown) => error));
    expect(message).not.toContain("secret-");
    expect(state.requests.map(({ method }) => method)).not.toContain("POST");
    expect(state.requests.map(({ method }) => method)).not.toContain("PATCH");
  });

  it("reads them from the configured environment", async () => {
    const state = host();

    await run(state, []);

    expect(state.requests).toContainEqual(
      expect.objectContaining({
        method: "GET",
        path: "/projects/proj/environments/production/envs",
      }),
    );
  });
});

describe("deploy's lookups", () => {
  it("refuses two Coolify applications with one app's name", async () => {
    const state = host({
      applications: [existing("hub", "h1"), existing("hub", "h2")],
    });

    await expect(run(state, [])).rejects.toThrow(
      "2 Coolify applications are named robkit-hub. Delete the extras.",
    );
  });

  it("names the server it can't find, and those it found", async () => {
    const state = host({
      servers: [
        { uuid: "a", name: "alpha" },
        { uuid: "b", name: "beta" },
      ],
    });

    await expect(run(state, [])).rejects.toThrow(
      "No Coolify server named localhost. Found: alpha, beta.",
    );
  });

  it("names the environment it can't find, and those the project has", async () => {
    const state = host({
      environments: [{ id: 2, uuid: "env-staging", name: "staging" }],
    });

    await expect(run(state, [])).rejects.toThrow(
      "The Coolify project robkit has no environment named production. Found: staging.",
    );
    expect(state.requests.map(({ method }) => method)).not.toContain("POST");
  });

  it("adopts an application whose environment id comes as a string", async () => {
    const state = host({
      applications: all().map((app) => ({ ...app, environment_id: "1" })),
    });

    await run(state, "all");

    expect(
      state.requests.filter(({ method }) => method === "POST"),
    ).not.toContainEqual(
      expect.objectContaining({ path: "/applications/private-github-app" }),
    );
  });

  it("writes nothing when Coolify lists an application without its environment", async () => {
    const unplaced = existing("notes", "n");
    delete unplaced.environment_id;
    const state = host({
      applications: [existing("core", "c"), existing("hub", "h"), unplaced],
    });

    await expect(run(state, "all")).rejects.toThrow(
      "Coolify listed an application without the environment it belongs to, so robkit deploy can't tell which applications are this install's, and wrote nothing. It needs Coolify 4.3 or later.",
    );
    expect(state.requests.map(({ method }) => method)).toEqual(
      state.requests.map(() => "GET"),
    );
  });

  it("takes Coolify's only server, whatever its name", async () => {
    const state = host({ servers: [{ uuid: "only", name: "box" }] });

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
    const state = host({
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
    const state = host({
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
    const state = host({
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
    const state = host({
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
    const state = host({
      applications: [existing("core", "c")],
      outcomes: { c: "cancelled-by-user" },
    });

    const { log } = await run(state, ["core"]);

    expect(log).toContain(
      "- core: failed, cancelled-by-user. Check the deployment's log in Coolify.",
    );
  });
});
