/** What a fake route answers: JSON with a status, or any response. */
export type Answer = { status?: number; body?: unknown } | Response;

export interface Call {
  /** The JSON the call posted, or undefined if it sent none. */
  body: unknown;
  request: Request;
}

/** Routes by method and path, such as `"POST /login"`. */
export type Routes = Record<string, (call: Call) => Answer | Promise<Answer>>;

/**
 * A `fetch` that answers for core at `origin` from `routes`, for tests to
 * stub in. Like core, it answers a path it doesn't have with a plain 404,
 * and it can't be reached at any other origin.
 */
export function fakeCore(origin: string, routes: Routes): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== origin) throw new TypeError("Failed to fetch");
    const route = routes[`${request.method} ${url.pathname}`];
    if (!route) return new Response("404 Not Found", { status: 404 });
    const json = request.headers.get("content-type") === "application/json";
    const text = await request.text();
    const body: unknown = json && text ? JSON.parse(text) : undefined;
    const answer = await route({ body, request });
    if (answer instanceof Response) return answer;
    return Response.json(answer.body ?? null, { status: answer.status ?? 200 });
  };
}

/** A `fetch` for core when it can't be reached. */
export const unreachable: typeof fetch = () =>
  Promise.reject(new TypeError("Failed to fetch"));
