import { request } from "node:http";
import {
  createRemoteJWKSet,
  customFetch,
  type FetchImplementation,
  type JWTVerifyGetKey,
} from "jose";

function isLoopbackName(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost");
}

/**
 * Fetches `*.localhost` URLs from 127.0.0.1 with the original Host header,
 * as browsers do (RFC 6761). Node's resolver often can't find these names,
 * and its fetch drops a Host header, so the dev proxy would never see which
 * app was asked for.
 */
const loopbackFetch: FetchImplementation = (url, options) => {
  const target = new URL(url);
  if (!isLoopbackName(target.hostname)) return fetch(url, options);
  return new Promise((resolve, reject) => {
    const headers = Object.fromEntries(options.headers);
    const req = request(
      {
        host: "127.0.0.1",
        port: target.port || 80,
        method: options.method,
        path: `${target.pathname}${target.search}`,
        headers: { ...headers, host: target.host },
        signal: options.signal,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("error", reject);
        res.on("end", () => {
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode ?? 502,
              headers: Object.entries(res.headers).flatMap(([name, value]) =>
                [value ?? []].flat().map((v): [string, string] => [name, v]),
              ),
            }),
          );
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
};

/**
 * Core's public keys, fetched from its JWKS endpoint on first use and cached,
 * so verifying a session token needs no call to core.
 *
 * @param coreOrigin core's public origin, such as `http://core.robkit.localhost:3000`
 */
export function coreKeys(coreOrigin: string): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL("/.well-known/jwks.json", coreOrigin), {
    [customFetch]: loopbackFetch,
  });
}
