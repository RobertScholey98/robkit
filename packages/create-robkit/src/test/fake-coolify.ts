/**
 * An in-memory stand-in for the parts of the Coolify API `robkit deploy`
 * uses, shaped after coollabsio/coolify v4's routes/api.php, as robnet's
 * deploy job tests it. Each route, as read in Coolify 4.7.5:
 *
 * - `GET /projects`, `GET /projects/{uuid}/environments` (id, name, uuid):
 *   app/Http/Controllers/Api/ProjectController.php
 * - `GET /projects/{uuid}/environments/{name}/envs`, each with its `key`,
 *   and its `value` only for a token that may read sensitive data:
 *   SharedEnvironmentVariablesController.php, since Coolify 4.3
 * - `GET /applications`, each with `environment_id` and `description`;
 *   `POST /applications/private-github-app`; `PATCH /applications/{uuid}`,
 *   which takes `description`; `PATCH /applications/{uuid}/envs/bulk`:
 *   ApplicationsController.php and app/Models/Application.php
 * - `POST /deploy`, `GET /deployments/{uuid}`, whose status is queued,
 *   in_progress, finished, failed or cancelled-by-user:
 *   DeployController.php and app/Enums/ApplicationDeploymentStatus.php
 * - a deployment's `commit`, which `GET /deployments/{uuid}` returns with
 *   the rest of its row. It is queued as `HEAD`. As the build starts, the
 *   job asks the remote where the branch is with `git ls-remote`, saves
 *   that commit on the deployment and checks out that commit:
 *   `queue_application_deployment` in bootstrap/helpers/applications.php,
 *   `check_git_if_build_needed` in app/Jobs/ApplicationDeploymentJob.php
 *   and `setGitImportSettings` in app/Models/Application.php
 * - `GET /servers`, `GET /github-apps`: ServersController.php and
 *   GithubController.php
 */
export interface FakeCoolify {
  projects: { uuid: string; name: string }[];
  servers: { uuid: string; name: string }[];
  githubApps: { uuid: string; name: string }[];
  /** The environments of every project, each with the id an application names. */
  environments: { id: number; uuid: string; name: string }[];
  /**
   * Every environment's shared variables, by name, as a token that may read
   * their values sees them.
   */
  sharedVariables: Record<string, string>;
  applications: Record<string, unknown>[];
  /** Each application's variables, by its uuid. */
  envs: Map<string, Map<string, Record<string, unknown>>>;
  /** How each deployment ends, by the application's uuid. Finished if unset. */
  outcomes: Record<string, string>;
  /**
   * The commit the branch holds, which each deployment says it built. Unset,
   * a deployment says `HEAD`, as one whose commit Coolify never resolved.
   */
  branch?: string;
  /** Every request, in order. */
  requests: { method: string; path: string; body: unknown }[];
  /**
   * Answers a route, such as `GET /servers`, in place of the fake's own
   * answer, or never answers it. Undefined leaves it to the fake.
   */
  answer?: (
    route: string,
  ) => { status: number; body: unknown } | "hang" | undefined;
}

export function fakeCoolify(overrides: Partial<FakeCoolify> = {}): FakeCoolify {
  return {
    projects: [{ uuid: "proj", name: "robkit" }],
    servers: [{ uuid: "srv", name: "localhost" }],
    githubApps: [
      { uuid: "public", name: "Public GitHub" },
      { uuid: "gh", name: "robkit-coolify" },
    ],
    environments: [{ id: 1, uuid: "env-production", name: "production" }],
    sharedVariables: {},
    applications: [],
    envs: new Map(),
    outcomes: {},
    requests: [],
    ...overrides,
  };
}

function handle(
  state: FakeCoolify,
  method: string,
  url: string,
  body: unknown,
): { status: number; body: unknown } | "hang" {
  const { pathname, searchParams } = new URL(url);
  const path = pathname.replace(/^\/api\/v1/, "");
  state.requests.push({
    method,
    path: `${path}${url.includes("?") ? `?${searchParams.toString()}` : ""}`,
    body,
  });
  const id = /^\/(?:applications|deployments)\/([^/]+)/.exec(path)?.[1] ?? "";
  const app = state.applications.find((candidate) => candidate.uuid === id);
  const project = /^\/projects\/([^/]+)/.exec(path)?.[1] ?? "";
  const route = `${method} ${path}`;
  const answered = state.answer?.(route);
  if (answered) return answered;
  const missing = { status: 404, body: { message: "Application not found." } };

  if (route === "GET /projects") return { status: 200, body: state.projects };
  if (route === "GET /servers") return { status: 200, body: state.servers };
  if (route === "GET /github-apps") {
    return { status: 200, body: state.githubApps };
  }
  if (route === "GET /applications") {
    return { status: 200, body: state.applications };
  }
  if (route === `GET /projects/${project}/environments`) {
    if (!state.projects.some(({ uuid }) => uuid === project)) {
      return { status: 404, body: { message: "Project not found." } };
    }
    return { status: 200, body: state.environments };
  }
  const environment = state.environments.find(
    ({ name, uuid }) =>
      route === `GET /projects/${project}/environments/${name}/envs` ||
      route === `GET /projects/${project}/environments/${uuid}/envs`,
  );
  if (environment) {
    return {
      status: 200,
      body: Object.entries(state.sharedVariables).map(([key, value], i) => ({
        id: i + 1,
        key,
        value,
        is_shown_once: false,
        type: "environment",
      })),
    };
  }
  if (route === "POST /applications/private-github-app") {
    const { environment_name: name, ...fields } = body as Record<
      string,
      unknown
    >;
    const environment = state.environments.find((env) => env.name === name);
    if (!environment) {
      return { status: 404, body: { message: "Environment not found." } };
    }
    const uuid = `app${String(state.applications.length + 1)}`;
    state.applications.push({
      ...fields,
      uuid,
      environment_id: environment.id,
    });
    return { status: 201, body: { uuid } };
  }
  if (route === `PATCH /applications/${id}`) {
    if (!app) return missing;
    Object.assign(app, body);
    return { status: 200, body: { uuid: id } };
  }
  if (route === `PATCH /applications/${id}/envs/bulk`) {
    if (!app) return missing;
    const envs =
      state.envs.get(id) ?? new Map<string, Record<string, unknown>>();
    for (const variable of (body as { data: Record<string, unknown>[] }).data) {
      envs.set(String(variable.key), variable);
    }
    state.envs.set(id, envs);
    return { status: 201, body: {} };
  }
  if (route === "POST /deploy") {
    const uuid = searchParams.get("uuid") ?? "";
    return {
      status: 200,
      body: {
        deployments: [
          {
            message: "queued",
            resource_uuid: uuid,
            deployment_uuid: `dep-${uuid}`,
          },
        ],
      },
    };
  }
  if (route === `GET /deployments/${id}`) {
    const uuid = id.replace(/^dep-/, "");
    return {
      status: 200,
      body: {
        status: state.outcomes[uuid] ?? "finished",
        commit: state.branch ?? "HEAD",
      },
    };
  }
  return { status: 404, body: { message: `no route ${route}` } };
}

/**
 * A `fetch` that answers from `state`. A route it hangs on waits until the
 * request's signal aborts.
 */
export function fakeFetch(state: FakeCoolify): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const raw = await request.text();
    const result = handle(
      state,
      request.method,
      request.url,
      raw ? (JSON.parse(raw) as unknown) : undefined,
    );
    if (result === "hang") {
      // The caller's signal, not the Request's: that only follows it weakly,
      // so once garbage collection takes the Request, it never aborts.
      const signal = init?.signal ?? request.signal;
      return new Promise((_, reject) => {
        signal.addEventListener("abort", () => {
          reject(signal.reason as Error);
        });
      });
    }
    return new Response(JSON.stringify(result.body), { status: result.status });
  };
}
