import type { Server } from "node:http";
import { orExit, readServeEnv } from "@robkit/input";
import { serve as serveNode, type ServerOptions } from "@robkit/serve";
import * as nextModule from "next";

export type ServeOptions = ServerOptions;

/** The function `next` exports, which makes Next's server. */
type CreateNext = typeof nextModule.default.default;

/**
 * Next is CommonJS, and its function is all it exports, so Node gives it
 * as the default. Next's types call it the default's default, as a bundler
 * would. This checks what Node gave instead of trusting either.
 */
function isCreateNext(value: unknown): value is CreateNext {
  return typeof value === "function";
}

/**
 * Serves a Next.js app in production on `HOST` and `PORT`, as `next build`
 * left it. Next answers its own built files under `/_next/static` and the
 * app's `public` folder, and runs `src/proxy.ts`, robkit's guard, before
 * its pages. The app is found from the folder it runs in. It stops on
 * SIGTERM, as `@robkit/serve` does.
 *
 * @returns the Node server, once Next is ready and the server has started
 * to listen
 */
export function serve(options: ServeOptions = {}): Promise<Server> {
  // Read before Next loads the build, so a setting that won't do stops it
  // first.
  const address = orExit(readServeEnv(process.env));
  const createNext: unknown = nextModule.default;
  if (!isCreateNext(createNext)) {
    throw new Error(
      `next exports ${typeof createNext}, not the function that makes its server.`,
    );
  }
  const app = createNext({
    dev: false,
    hostname: address.host,
    port: address.port,
  });
  return app
    .prepare()
    .then(() => serveNode(app.getRequestHandler(), { ...options, address }));
}
