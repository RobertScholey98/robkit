// What an app's own server reads from its environment, each read whole:
// where it listens, what its Vite dev server needs, and what its guard
// needs. pnpm dev and robkit deploy set these variables. See
// docs/conventions/input.md.

import type { Slug } from "./install-addresses.ts";
import {
  allProblems,
  isProblem,
  readAppSlug,
  readCoreUrl,
  readDomain,
  readHost,
  readPort,
  type Env,
  type InputProblem,
} from "./input.ts";

/** Where a server listens: `HOST` and `PORT`, by default 127.0.0.1:3000. */
export function readServeEnv(
  env: Env,
): { host: string; port: number } | InputProblem {
  const host = readHost(env);
  const port = readPort(env, "PORT", 3000);
  if (isProblem(host) || isProblem(port)) {
    return allProblems(host, port);
  }
  return { host, port };
}

/**
 * What `pnpm dev` hands an app's Vite dev server, each when it's set: the
 * port to listen on, and the domain its host is under.
 */
export function readDevServerEnv(
  env: Env,
): { port?: number; domain?: string } | InputProblem {
  // An empty variable counts as unset, as the readers take it.
  const port = env.PORT ? readPort(env) : undefined;
  const domain = env.ROBKIT_DOMAIN ? readDomain(env) : undefined;
  if (isProblem(port) || isProblem(domain)) return allProblems(port, domain);
  return {
    ...(port !== undefined && { port }),
    ...(domain !== undefined && { domain }),
  };
}

/** What an app's guard needs: its slug and core's public origin. */
export function readGuardEnv(
  env: Env,
): { app: Slug; core: string } | InputProblem {
  const app = readAppSlug(env);
  const core = readCoreUrl(env);
  if (isProblem(app) || isProblem(core)) {
    return allProblems(app, core);
  }
  return { app, core };
}
