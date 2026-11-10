import type { Server } from "node:http";
import {
  serve as serveNode,
  type RequestHandler,
  type ServerOptions,
} from "@robkit/serve";

export interface ServeOptions extends ServerOptions {
  /** The client's built files, answered under `/assets`. `dist/assets` unless set. */
  assets?: string;
  /** The app's own files, answered at the root. `public` unless set. */
  public?: string;
}

/**
 * Serves an Express app in production on `HOST` and `PORT`: the client's
 * built files under `/assets`, then the files in the app's `public` folder
 * at the root, then the app. Folders are found from the folder the app
 * runs in. It stops on SIGTERM, as `@robkit/serve` does.
 *
 * @returns the Node server, which has started to listen
 */
export function serve(app: RequestHandler, options: ServeOptions = {}): Server {
  const { assets = "dist/assets", public: own = "public", ...rest } = options;
  return serveNode(app, {
    ...rest,
    files: [
      { at: "/assets", folder: assets },
      { at: "/", folder: own },
    ],
  });
}
