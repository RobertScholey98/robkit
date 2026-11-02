import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { FetchImplementation } from "jose";

function isLoopbackName(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost");
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
