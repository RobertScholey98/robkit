// What an app's own server reads from its environment, each read whole:
// where it listens, what its Vite dev server needs, and what its guard
// needs. pnpm dev and robkit deploy set these variables. See
// docs/conventions/input.md.

import type { Slug } from "./slug.ts";
import {
  readAppSlug,
  readCoreUrl,
  readDomain,
  readHost,
  readPort,
  type CoreOrigin,
  type Domain,
  type Env,
} from "./env.ts";
import { allProblems, isProblem, type InputProblem } from "./problem.ts";

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
): { port?: number; domain?: Domain } | InputProblem {
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
): { app: Slug; core: CoreOrigin } | InputProblem {
  const app = readAppSlug(env);
  const core = readCoreUrl(env);
  if (isProblem(app) || isProblem(core)) {
    return allProblems(app, core);
  }
  return { app, core };
}

/**
 * `read`'s value, or its problem printed alone and the process ended with
 * exit code 1. An app's server and scripts read their environment with it as
 * they start, so a variable that won't do prints the line that says how to
 * fix it, not a stack. A Vite config, which prints what it throws, uses
 * `orThrow`.
 */
export function orExit<T>(read: T | InputProblem): T {
  if (!isProblem(read)) return read;
  console.error(read.error);
  // eslint-disable-next-line robkit/layer -- the one exit, for a server's start; the browser never calls it
  process.exit(1);
}
