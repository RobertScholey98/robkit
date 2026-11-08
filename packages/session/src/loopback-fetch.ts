import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import type { FetchImplementation } from "jose";

function isLoopbackName(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost");
}

/** The body of `res` as a web stream, which errors if `res` breaks off. */
function bodyOf(res: IncomingMessage): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      res.on("data", (chunk: Buffer) => {
        controller.enqueue(chunk);
      });
      res.on("end", () => {
        controller.close();
      });
      res.on("error", (error) => {
        controller.error(error);
      });
    },
    cancel() {
      res.destroy();
    },
  });
}

/**
 * Fetches `*.localhost` URLs from 127.0.0.1 with the original Host header,
 * as browsers do (RFC 6761). Node's resolver often can't find these names,
 * and its fetch drops a Host header, so the dev proxy would never see which
 * app was asked for.
 */
export const loopbackFetch: FetchImplementation = (url, options) => {
  const target = new URL(url);
  if (!isLoopbackName(target.hostname)) return fetch(url, options);
  const https = target.protocol === "https:";
  const request = https ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const headers = Object.fromEntries(options.headers);
    const req = request(
      {
        host: "127.0.0.1",
        port: target.port || (https ? 443 : 80),
        // The certificate is for the name, not the address connected to.
        servername: target.hostname,
        method: options.method,
        path: `${target.pathname}${target.search}`,
        headers: { ...headers, host: target.host },
        signal: options.signal,
      },
      // Like fetch, it answers once the headers arrive. A body cut off after
      // that fails its read, not the request.
      (res) => {
        resolve(
          new Response(bodyOf(res), {
            status: res.statusCode ?? 502,
            headers: Object.entries(res.headers).flatMap(([name, value]) =>
              [value ?? []].flat().map((v): [string, string] => [name, v]),
            ),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
};

/** Core didn't answer: the network failed, or the request timed out. */
export class CoreUnreachableError extends Error {
  override name = "CoreUnreachableError";
}

/**
 * {@link loopbackFetch} for a call to core. A request that gets no answer
 * rejects with a {@link CoreUnreachableError} naming core's origin, with the
 * network's own error as its cause.
 */
export const coreFetch: FetchImplementation = async (url, options) => {
  try {
    return await loopbackFetch(url, options);
  } catch (error) {
    throw new CoreUnreachableError(
      `Can't reach core at ${new URL(url).origin}.`,
      { cause: error },
    );
  }
};
