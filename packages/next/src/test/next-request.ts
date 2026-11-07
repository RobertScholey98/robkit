// Stands in for the part of Next that runs between the proxy and the app: it
// takes the proxy's answer and either sends it, or serves the request with
// the request headers the proxy set, which `headers()` from `next/headers`
// then reads. The tests mock `next/headers` with `requestHeaders`. The
// package's next-app tests check the same against a real Next server.

let current: Headers | undefined;

/** What `headers()` reads in the request being served, as Next sets them. */
export function requestHeaders(): Promise<Headers> {
  if (current === undefined) {
    return Promise.reject(
      new Error(`headers() was called outside a request: ${String(current)}`),
    );
  }
  return Promise.resolve(current);
}

/**
 * Asks `proxy` about `request`, as Next does. When it says go on, serves
 * `page` with the headers the proxy passed on. Otherwise answers with what
 * the proxy said.
 */
export async function throughProxy(
  proxy: (request: Request) => Promise<Response>,
  request: Request,
  page: () => Promise<Response>,
): Promise<Response> {
  const answer = await proxy(request);
  if (answer.headers.get("x-middleware-next") !== "1") return answer;
  const forwarded = new Headers();
  const names = answer.headers.get("x-middleware-override-headers") ?? "";
  for (const name of names.split(",")) {
    const value = answer.headers.get(`x-middleware-request-${name}`);
    if (value !== null) forwarded.set(name, value);
  }
  return servedWith(forwarded, page);
}

/** Serves `page` as if the request came with `headers`. */
export async function servedWith(
  headers: Headers,
  page: () => Promise<Response>,
): Promise<Response> {
  current = headers;
  try {
    return await page();
  } finally {
    current = undefined;
  }
}
