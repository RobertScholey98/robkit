/**
 * An in-memory stand-in for the parts of the Coolify API `robkit deploy`
 * uses, shaped after coollabsio/coolify v4's routes/api.php, as robnet's
 * deploy job tests it.
 */
export interface FakeCoolify {
  projects: { uuid: string; name: string }[];
  servers: { uuid: string; name: string }[];
  githubApps: { uuid: string; name: string }[];
  applications: Record<string, unknown>[];
  /** Each application's variables, by its uuid. */
  envs: Map<string, Map<string, Record<string, unknown>>>;
  /** How each deployment ends, by the application's uuid. Finished if unset. */
  outcomes: Record<string, string>;
  /** Every request, in order. */
  requests: { method: string; path: string; body: unknown }[];
}

export function fakeCoolify(overrides: Partial<FakeCoolify> = {}): FakeCoolify {
  return {
    projects: [{ uuid: "proj", name: "robkit" }],
    servers: [{ uuid: "srv", name: "localhost" }],
    githubApps: [
      { uuid: "public", name: "Public GitHub" },
      { uuid: "gh", name: "robkit-coolify" },
    ],
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
): { status: number; body: unknown } {
  const { pathname, searchParams } = new URL(url);
  const path = pathname.replace(/^\/api\/v1/, "");
  state.requests.push({
    method,
    path: `${path}${url.includes("?") ? `?${searchParams.toString()}` : ""}`,
    body,
  });
  const id = /^\/(?:applications|deployments)\/([^/]+)/.exec(path)?.[1] ?? "";
  const app = state.applications.find((candidate) => candidate.uuid === id);
  const route = `${method} ${path}`;
  const missing = { status: 404, body: { message: "Application not found." } };

  if (route === "GET /projects") return { status: 200, body: state.projects };
  if (route === "GET /servers") return { status: 200, body: state.servers };
  if (route === "GET /github-apps") {
    return { status: 200, body: state.githubApps };
  }
  if (route === "GET /applications") {
    return { status: 200, body: state.applications };
  }
  if (route === "POST /applications/private-github-app") {
    const uuid = `app${String(state.applications.length + 1)}`;
    state.applications.push({ ...(body as object), uuid });
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
      body: { status: state.outcomes[uuid] ?? "finished" },
    };
  }
  return { status: 404, body: { message: `no route ${route}` } };
}

/** A `fetch` that answers from `state`. */
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
    return new Response(JSON.stringify(result.body), { status: result.status });
  };
}
