import { realpathSync } from "node:fs";
import { dirname, sep } from "node:path";
import { orThrow, readDevServerEnv, readGuardEnv } from "@robkit/input";
import type { NextConfig } from "next";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from "next/constants";

// Next's telemetry stays off. It reads this after loading this file.
process.env.NEXT_TELEMETRY_DISABLED = "1";

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

// robkit-dev assigns PORT, which next dev reads, and serves the app on
// <slug>.<domain> through its proxy.
export default function nextConfig(phase: string): NextConfig {
  const { domain } = orThrow(readDevServerEnv(process.env));
  // Next loads src/proxy.ts on the first request, so check its config now.
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    orThrow(readGuardEnv(process.env));
  }
  // Production installs no dev dependencies, @robkit/next among them, and
  // builds nothing.
  const building =
    phase === PHASE_DEVELOPMENT_SERVER || phase === PHASE_PRODUCTION_BUILD;
  const checkout = building ? linkedCheckout() : undefined;
  return {
    // turbo's outputs and the install's Dockerfile find the build in dist.
    distDir: "dist",
    // The dev proxy's host, which Next's dev server would otherwise refuse
    // its own files to.
    ...(domain && { allowedDevOrigins: [domain, `*.${domain}`] }),
    // This app's AGENTS.md is the install's. next dev would add its own
    // section to it.
    agentRules: false,
    ...(checkout && {
      experimental: {
        turbopackAdditionalRoots: { robkit: { path: checkout } },
      },
    }),
  };
}
