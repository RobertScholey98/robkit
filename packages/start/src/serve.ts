import { existsSync } from "node:fs";
import type { Server } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isRecord, orExit, problem, readServeEnv } from "@robkit/input";
import { serve as serveNode, type ServerOptions } from "@robkit/serve";
import { NodeRequest, sendNodeResponse } from "srvx/node";

export interface ServeOptions extends ServerOptions {
  /**
   * The client's built files, answered at the root: what `vite build`
   * writes for the browser, with the app's `public` folder copied in.
   * `dist/client` unless set.
   */
  client?: string;
  /** Start's built server entry. `dist/server/server.js` unless set. */
  server?: string;
}

/** What Start's built server entry exports as its default. */
interface ServerEntry {
  fetch: (request: Request) => Response | Promise<Response>;
}

function isServerEntry(value: unknown): value is ServerEntry {
  return isRecord(value) && typeof value.fetch === "function";
}

function isServerModule(value: unknown): value is { default: ServerEntry } {
  return isRecord(value) && isServerEntry(value.default);
}

/** The server entry the built module at `path` exports as its default. */
async function load(path: string): Promise<ServerEntry> {
  const loaded: unknown = await import(pathToFileURL(path).href);
  if (!isServerModule(loaded)) {
    throw new Error(`${path} exports no server entry as its default.`);
  }
  return loaded.default;
}

/**
 * Serves a TanStack Start app in production on `HOST` and `PORT`: the
 * client's built files at the root, then Start's built server entry, which
 * is the app's `src/server.ts` with robkit's guard. Nothing else in `dist`
 * is answered. Folders are found from the folder the app runs in. It stops
 * on SIGTERM, as `@robkit/serve` does. It exits 1, saying to build the
 * app, when the server entry is missing.
 *
 * @returns the Node server, which has started to listen
 */
export function serve(options: ServeOptions = {}): Promise<Server> {
  const {
    client = "dist/client",
    server = "dist/server/server.js",
    ...rest
  } = options;
  // Read before the entry loads, so a setting that won't do stops it first.
  const address = orExit(readServeEnv(process.env));
  const path = resolve(server);
  if (!existsSync(path)) {
    orExit(
      problem(
        `${path} isn't there. Run the app's build, pnpm build, before it serves.`,
      ),
    );
  }
  return load(path).then((entry) =>
    // Each request goes to the entry as a fetch Request through srvx,
    // which is how Start itself serves on Node.
    serveNode(
      async (request, response) => {
        const answer = await entry.fetch(
          new NodeRequest({ req: request, res: response }),
        );
        await sendNodeResponse(response, answer);
      },
      { ...rest, address, files: [{ at: "/", folder: client }] },
    ),
  );
}
