import {
  allProblems,
  type CoreOrigin,
  type Env,
  type InputProblem,
  isProblem,
  readCoreUrl,
  readDatabaseUrl,
  readHost,
  readPort,
} from "@robkit/input";
import { type ListedApp } from "@robkit/input/manifest";
import { readListedApps } from "./apps.ts";
import { readTrustedProxy, type TrustedProxy } from "./client.ts";

/** What core starts with, read from its environment. */
export interface CoreConfig {
  /** `DATABASE_URL`: core's own database. */
  databaseUrl: string;
  /**
   * `ROBKIT_CORE_URL`: core's public origin, such as
   * `https://core.robkit.dev`. The install's domain, protocol and port come
   * from it alone: core doesn't read `ROBKIT_DOMAIN`.
   */
  origin: CoreOrigin;
  /** `ROBKIT_APPS`: the owner's apps, as each declares itself. */
  apps: ListedApp[];
  /** `ROBKIT_TRUSTED_PROXY`: a proxy further out that names each visitor. */
  trustedProxy?: TrustedProxy;
  /** `HOST`: loopback unless set, so only the proxy reaches core. */
  host: string;
  /** `PORT`. */
  port: number;
}

/**
 * Core's environment, or every variable that won't do, one per line, so
 * core refuses to start rather than run on a setting it misread.
 */
export function readCoreConfig(env: Env): CoreConfig | InputProblem {
  const databaseUrl = readDatabaseUrl(env);
  const origin = readCoreUrl(env);
  const apps = readListedApps(env);
  const trustedProxy = readTrustedProxy(env);
  const host = readHost(env);
  const port = readPort(env);
  if (
    isProblem(databaseUrl) ||
    isProblem(origin) ||
    isProblem(apps) ||
    isProblem(trustedProxy) ||
    isProblem(host) ||
    isProblem(port)
  ) {
    return allProblems(databaseUrl, origin, apps, trustedProxy, host, port);
  }
  return {
    databaseUrl,
    origin,
    apps,
    ...(trustedProxy && { trustedProxy }),
    host,
    port,
  };
}
