import { resolve } from "node:path";
import { orThrow, readDevServerEnv, readGuardEnv } from "@robkit/input";
import { securityHeaders } from "@robkit/input/headers";
import type { BuildEnvironmentOptions, Plugin, UserConfig } from "vite";

export interface RobkitOptions {
  /**
   * Whether the app has a guard, which sends its own headers and needs
   * `ROBKIT_APP` and `ROBKIT_CORE_URL`. Only the hub sets it to `false`:
   * the dev server then checks neither and sends the hub's headers itself.
   */
  guarded?: boolean;
  /**
   * The entry of a server Vite builds, such as `"src/serve.ts"`. `vite build`
   * then writes it, ready for Node, to `dist/serve.js`, and the stylesheet
   * its page links to `dist/assets`, where `serve()` from `@robkit/serve`
   * looks. Leave it out when the app builds another way.
   */
  serve?: string;
}

/**
 * Sets an app's Vite dev server up behind `pnpm dev`'s proxy: it listens
 * on 127.0.0.1 at `PORT`, never another port, and answers the install's
 * host names. A guarded app's settings are checked as the server starts,
 * since the guard is loaded only on the first request.
 *
 * For a build it changes nothing unless `serve` names a server entry. It
 * changes nothing under Vitest, which loads the app's config with no
 * `pnpm dev` behind it and sets `VITEST` before it does.
 */
export function robkit({ guarded = true, serve }: RobkitOptions = {}): Plugin {
  return {
    name: "robkit",
    config(config, { command }) {
      // Vitest runs Vite's serve command, so only vite build gets here. A
      // vite build that a test starts inherits VITEST, and still needs the
      // layout its start script expects.
      if (command === "build") {
        return serve === undefined ? undefined : serverBuild(config, serve);
      }
      if (process.env.VITEST) return;
      if (guarded) orThrow(readGuardEnv(process.env));
      const { port, domain } = orThrow(readDevServerEnv(process.env));
      return {
        server: {
          host: "127.0.0.1",
          ...(port && { port, strictPort: true }),
          ...(domain && { allowedHosts: [`.${domain}`] }),
        },
      };
    },
    configureServer(server) {
      if (guarded || process.env.VITEST) return;
      // The hub's headers, as core sends them: nobody may frame it. pnpm dev
      // serves plain http, so there is no HSTS to send.
      const headers = securityHeaders("http://localhost", "none");
      server.middlewares.use((_req, res, next) => {
        for (const [name, value] of headers) res.setHeader(name, value);
        next();
      });
    },
  };
}

/**
 * The server build's layout, merged over the app's config. Vite lets a
 * plugin's settings win over the app's, so an app's own setting that
 * disagrees stops the build here rather than losing quietly. The same
 * value, or the same path written another way, isn't a disagreement.
 */
function serverBuild(config: UserConfig, serve: string): UserConfig {
  const own: BuildEnvironmentOptions = { ...config.build };
  const root = resolve(config.root ?? "");
  const samePath = (set: unknown, path: string) =>
    typeof set === "string" && resolve(root, set) === resolve(root, path);
  const problems = [
    own.ssr !== undefined &&
      !samePath(own.ssr, serve) &&
      disagreement("ssr", own.ssr, `the server's entry is "${serve}"`),
    own.outDir !== undefined &&
      !samePath(own.outDir, "dist") &&
      disagreement(
        "outDir",
        own.outDir,
        "the start script runs dist/serve.js and serve() answers dist/assets",
      ),
    own.ssrEmitAssets === false &&
      disagreement(
        "ssrEmitAssets",
        false,
        "without it the build leaves out the page's stylesheet",
      ),
  ].filter((problem) => problem !== false);
  if (problems.length > 0) {
    throw new Error(
      [
        "vite.config.ts sets the server build's layout beside robkit({ serve }), which sets it itself.",
        ...problems,
      ].join("\n"),
    );
  }
  return { build: { ssr: serve, outDir: "dist", ssrEmitAssets: true } };
}

/** One line of a disagreement's message: the setting, why, and what to do. */
function disagreement(setting: string, set: unknown, why: string): string {
  return `- build.${setting} is ${JSON.stringify(set)}, but ${why}. Remove build.${setting} from vite.config.ts.`;
}
