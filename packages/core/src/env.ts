import {
  allProblems,
  isProblem,
  readDatabaseUrl,
  readDomain,
  readHost,
  readPort,
  type DeclaredApp,
  type Env,
  type InputProblem,
} from "@robkit/session/input";
import { readDeclaredApps } from "./apps.ts";
import { readTrustedProxy, type TrustedProxy } from "./client.ts";

/** What core starts with, read from its environment. */
export interface CoreConfig {
  /** `DATABASE_URL`: core's own database. */
  databaseUrl: string;
  /** `ROBKIT_DOMAIN`: the install's domain, such as `robkit.dev`. */
  domain: string;
  /** `ROBKIT_APPS`: the owner's apps, as each declares itself. */
  apps: DeclaredApp[];
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
  const domain = readDomain(env);
  const apps = readDeclaredApps(env);
  const trustedProxy = readTrustedProxy(env);
  const host = readHost(env);
  const port = readPort(env);
  if (
    isProblem(databaseUrl) ||
    isProblem(domain) ||
    isProblem(apps) ||
    isProblem(trustedProxy) ||
    isProblem(host) ||
    isProblem(port)
  ) {
    return allProblems(databaseUrl, domain, apps, trustedProxy, host, port);
  }
  return {
    databaseUrl,
    domain,
    apps,
    ...(trustedProxy && { trustedProxy }),
    host,
    port,
  };
}
