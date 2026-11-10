import { existsSync } from "node:fs";
import type { Server } from "node:http";
import { join } from "node:path";
import { orExit, problem, readCoreUrl } from "@robkit/input";
import { securityHeaders } from "@robkit/input/headers";
import serveStatic from "serve-static";
import { serveWith, type ServeOptions } from "./serve.ts";

export interface PageOptions extends Omit<ServeOptions, "files"> {
  /** The folder `vite build` wrote the page to. `dist` unless set. */
  folder?: string;
}

/**
 * Serves a built page with no app behind it, such as the hub's: each file
 * in `folder`, and its `index.html` for a GET or HEAD of any other path,
 * so the page can have routes of its own. Every answer carries the hub's
 * headers: nobody may frame it, `nosniff`, and HSTS when
 * `ROBKIT_CORE_URL` is https. Otherwise it is `serve`.
 *
 * @returns the server, which has started to listen
 */
export function servePage(options: PageOptions = {}): Server {
  const { folder = "dist", ...rest } = options;
  // Every container sets it. Without it, as under a plain `pnpm start`,
  // the page is served over http, with no HSTS.
  const core = process.env.ROBKIT_CORE_URL
    ? orExit(readCoreUrl(process.env))
    : "http://localhost";
  const page = join(folder, "index.html");
  if (!existsSync(page)) {
    orExit(
      problem(
        `${page} isn't there. Run the app's build, pnpm build, before it serves.`,
      ),
    );
  }
  const answer = serveStatic(folder, { index: false, redirect: false });
  return serveWith(
    (request, response) => {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(404).end();
        return;
      }
      const asked = request.url;
      request.url = "/index.html";
      return new Promise((resolve, reject) => {
        response.once("close", resolve);
        answer(request, response, (error?: unknown) => {
          request.url = asked;
          reject(
            new Error(`serve-static couldn't send ${page}.`, { cause: error }),
          );
        });
      });
    },
    { ...rest, files: [{ at: "/", folder }] },
    securityHeaders(core, "none"),
  );
}
