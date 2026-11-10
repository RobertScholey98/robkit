import { realpathSync } from "node:fs";
import { dirname, sep } from "node:path";
import { orThrow, readDevServerEnv, readGuardEnv } from "@robkit/input";
import type { NextConfig } from "next";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from "next/constants.js";

/**
 * The robkit checkout a linked install (init's --link) takes robkit's
 * packages from, outside the install. Turbopack reads files outside the
 * install only from an additional root. An install from npm has none.
 */
function linkedCheckout(): string | undefined {
  const adapter = realpathSync("node_modules/@robkit/next");
  return adapter.split(sep).includes("node_modules")
    ? undefined
    : dirname(dirname(adapter));
}

/**
 * The function Next calls with its phase, giving `config`, the app's own
 * settings, with what an app needs in an install: the build in `dist`,
 * where turbo and the install's Dockerfile find it, and Next's own
 * `AGENTS.md` section off, since the app's is the install's. `next dev`
 * also allows the dev proxy's host, and checks the guard's settings, since
 * Next loads `proxy.ts` only on the first request. `next dev` and
 * `next build` read a linked install's checkout as an extra Turbopack root.
 *
 * Next loads this in production too, so it imports nothing from the guard.
 */
export function withRobkit(
  config: NextConfig = {},
): (phase: string) => NextConfig {
  return (phase) => {
    // next build makes its telemetry after it loads this. The production
    // server makes none, and next dev's own process never loads this, so
    // pnpm dev sets it there.
    process.env.NEXT_TELEMETRY_DISABLED = "1";
    const developing = phase === PHASE_DEVELOPMENT_SERVER;
    let domain: string | undefined;
    if (developing) {
      orThrow(readGuardEnv(process.env));
      domain = orThrow(readDevServerEnv(process.env)).domain;
    }
    const checkout =
      developing || phase === PHASE_PRODUCTION_BUILD
        ? linkedCheckout()
        : undefined;
    const origins = [
      ...(config.allowedDevOrigins ?? []),
      ...(domain ? [domain, `*.${domain}`] : []),
    ];
    return {
      ...config,
      distDir: "dist",
      ...(origins.length > 0 && { allowedDevOrigins: origins }),
      agentRules: false,
      ...(checkout && {
        experimental: {
          ...config.experimental,
          turbopackAdditionalRoots: {
            ...config.experimental?.turbopackAdditionalRoots,
            robkit: { path: checkout },
          },
        },
      }),
    };
  };
}
