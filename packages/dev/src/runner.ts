import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { catalogOf, discoverApps, routesFor, type App } from "./apps.ts";
import { exec, prefixLines } from "./exec.ts";
import { createProxy } from "./proxy.ts";
import { provisionDatabase } from "./provision.ts";

/** How long an app gets to exit after SIGTERM before it is killed. */
const stopTimeoutMs = 5000;

function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Stops an app's whole process group: its package manager, watcher and server. */
async function stopGroup(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (pid === undefined) return;
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    return;
  }
  const deadline = Date.now() + stopTimeoutMs;
  while (groupAlive(pid) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (groupAlive(pid)) process.kill(-pid, "SIGKILL");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * `robkit-dev`: runs the install in `root` for local development. Finds the
 * apps, refusing any folder that isn't a slug before it starts anything. Starts
 * Postgres, provisions and migrates every app with a database, starts every
 * app and puts the proxy in front. Stops it all on SIGINT or SIGTERM, or as
 * soon as any app exits.
 *
 * @returns the exit code: 0 after a signal, 1 if anything failed
 */
export async function runDev(
  root: string,
  env: NodeJS.ProcessEnv,
): Promise<number> {
  const domain = env.ROBKIT_DOMAIN ?? "robkit.localhost";
  const devPort = Number(env.ROBKIT_DEV_PORT ?? 3000);
  const adminUrl =
    env.ROBKIT_DATABASE_URL ??
    `postgres://postgres:postgres@127.0.0.1:${env.ROBKIT_POSTGRES_PORT ?? "54320"}/robkit`;
  let apps: App[];
  try {
    apps = await discoverApps(root, devPort + 1);
  } catch (error) {
    console.error(errorMessage(error));
    return 1;
  }
  const appEnv: NodeJS.ProcessEnv = {
    ...env,
    ROBKIT_DOMAIN: domain,
    ROBKIT_CORE_URL: `http://core.${domain}:${String(devPort)}`,
    ROBKIT_APPS: catalogOf(apps),
  };
  delete appEnv.ROBKIT_DATABASE_URL;
  delete appEnv.DATABASE_URL;

  // The first reason to stop wins; later signals or exits change nothing.
  let outcome: "interrupted" | "failed" | undefined;
  const { promise: stopRequested, resolve: wake } =
    Promise.withResolvers<undefined>();
  const stop = (why: "interrupted" | "failed") => {
    outcome ??= why;
    wake(undefined);
  };
  const stopping = () => outcome !== undefined;
  const onSignal = () => {
    stop("interrupted");
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  const running: ChildProcess[] = [];
  const proxy = createProxy(routesFor(apps, domain));

  const start = (app: App, databaseUrl: string | undefined) => {
    const child = spawn("pnpm", ["run", "dev"], {
      cwd: app.dir,
      env: {
        ...appEnv,
        ROBKIT_APP: app.slug,
        PORT: String(app.port),
        ...(databaseUrl && { DATABASE_URL: databaseUrl }),
      },
      // Its own process group, so stopping it reaches every process it spawns.
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    prefixLines(app.slug, child.stdout, process.stdout);
    prefixLines(app.slug, child.stderr, process.stderr);
    child.on("exit", (code, signal) => {
      if (stopping()) return;
      console.error(`${app.slug} exited (${String(signal ?? code)}), stopping`);
      stop("failed");
    });
    running.push(child);
  };

  try {
    await exec("docker", ["compose", "up", "-d", "--wait"], { cwd: root, env });

    const databaseUrls = new Map<string, string>();
    for (const app of apps.filter((a) => a.migrates)) {
      if (stopping()) break;
      const databaseUrl = await provisionDatabase(adminUrl, app.slug);
      await exec("pnpm", ["run", "migrate"], {
        cwd: app.dir,
        env: { ...appEnv, DATABASE_URL: databaseUrl },
        slug: app.slug,
      });
      databaseUrls.set(app.slug, databaseUrl);
    }

    if (!stopping()) {
      for (const app of apps) start(app, databaseUrls.get(app.slug));
      proxy.listen(devPort);
      await once(proxy, "listening");
      console.log("\nrobkit is running:");
      for (const app of apps) {
        console.log(`  http://${app.slug}.${domain}:${String(devPort)}`);
      }
      console.log();
    }
  } catch (error) {
    console.error(errorMessage(error));
    stop("failed");
  }

  await stopRequested;
  await Promise.all(running.map(stopGroup));
  proxy.closeAllConnections();
  proxy.close();
  try {
    await exec("docker", ["compose", "stop"], { cwd: root, env });
  } catch (error) {
    console.error(errorMessage(error));
    stop("failed");
  }
  process.off("SIGINT", onSignal);
  process.off("SIGTERM", onSignal);
  return outcome === "failed" ? 1 : 0;
}
