import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { install } from "@robkit/input/addresses";
import { isProblem } from "@robkit/input";
import { CommandProblem } from "@robkit/input/command";
import {
  appSettings,
  type InstallFacts,
  sharedSettings,
  shellForApps,
} from "./app-env.ts";
import { catalogOf, discoverApps, routesFor, type App } from "./apps.ts";
import { checkBeforeStart, proxyPortProblem } from "./checks.ts";
import { readDevConfig, withInstallEnv } from "./env.ts";
import { exec, prefixLines, startProblem } from "./exec.ts";
import { failuresOf, throwFailures } from "./failures.ts";
import { startProxy, type Proxy } from "./proxy.ts";
import { stopGroup } from "./process-group.ts";
import { provisionApps } from "./provision.ts";
import { requireGo } from "./toolchain.ts";

/**
 * `robkit-dev`: runs the install in `root` for local development, refusing a
 * folder with no `robkit.json`. Finds the apps, refusing any folder that isn't a slug, or a Go app without Go, before
 * it starts anything. Starts Postgres, runs the provision step, starts every
 * app and puts the proxy in front. Stops it all on SIGINT or SIGTERM, or as soon as any app exits.
 *
 * @returns the exit code: 0 after a signal, 1 if an app exited
 * @throws what failed while starting or stopping, once everything stopped:
 *   one failure as it is, or several in an AggregateError
 */
export async function runDev(
  root: string,
  shell: NodeJS.ProcessEnv,
): Promise<number> {
  if (!existsSync(join(root, "robkit.json"))) {
    throw new CommandProblem(
      `${root} isn't a robkit install: it has no robkit.json. Run pnpm dev in an install's folder.`,
    );
  }
  const env = await withInstallEnv(root, shell);
  const config = readDevConfig(env);
  if (isProblem(config)) {
    console.error(config.error);
    return 1;
  }
  const { domain, devPort, adminUrl, postgresPort } = config;
  const addresses = install({ domain, port: devPort });
  const apps = await discoverApps(root, devPort + 1);
  // An app with a go.mod runs on Go. Say so before anything starts.
  if (apps.some((app) => existsSync(join(app.dir, "go.mod")))) {
    await requireGo(env);
  }
  // Before anything starts, and outside the stop below, so a second pnpm
  // dev stops nothing the first one runs.
  await checkBeforeStart({ root, env, devPort, postgresPort, apps });
  const facts: InstallFacts = {
    domain,
    coreUrl: addresses.origin("core"),
    catalog: catalogOf(apps),
  };
  const shellEnv = shellForApps(env);

  // The first reason to stop wins; later signals or exits change nothing.
  let outcome: "interrupted" | "failed" | undefined;
  // What failed, thrown once everything has stopped.
  const failures: unknown[] = [];
  const { promise: stopRequested, resolve: wake } =
    Promise.withResolvers<undefined>();
  const stopController = new AbortController();
  const stop = (why: "interrupted" | "failed") => {
    outcome ??= why;
    stopController.abort();
    wake(undefined);
  };
  const stopping = () => outcome !== undefined;
  const onSignal = () => {
    stop("interrupted");
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  const running: { slug: string; child: ChildProcess }[] = [];
  let proxy: Proxy | undefined;

  const start = (app: App, databaseUrl: string | undefined) => {
    const child = spawn("pnpm", ["run", "dev"], {
      cwd: app.dir,
      env: { ...shellEnv, ...appSettings(facts, app, databaseUrl) },
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
    // Emitted instead of exit when the app can't start, such as pnpm
    // missing or its folder gone.
    child.on("error", (error) => {
      if (!stopping()) console.error(`${app.slug} couldn't start, stopping`);
      failures.push(startProblem("pnpm", ["run", "dev"], app.dir, error));
      stop("failed");
    });
    running.push({ slug: app.slug, child });
  };

  // Whether compose up failed, which then says what is wrong with Docker.
  let composeUpFailed = false;
  try {
    await exec("docker", ["compose", "up", "-d", "--wait"], {
      cwd: root,
      env,
    }).catch((error: unknown) => {
      composeUpFailed = true;
      throw error;
    });

    const databaseUrls = await provisionApps(root, {
      adminUrl,
      env: { ...shellEnv, ...sharedSettings(facts) },
      signal: stopController.signal,
    });

    if (!stopping()) {
      // The proxy first, so a port taken since the check starts no app.
      proxy = await startProxy(routesFor(apps, domain), devPort).catch(
        (error: unknown) => {
          if (error instanceof Error && "code" in error) {
            if (error.code === "EADDRINUSE") throw proxyPortProblem(devPort);
          }
          throw error;
        },
      );
      for (const app of apps) start(app, databaseUrls.get(app.slug));
      console.log("\nrobkit is running:");
      for (const app of apps) {
        console.log(`  ${addresses.origin(app.slug)}`);
      }
      console.log();
    }
  } catch (error) {
    failures.push(error);
    stop("failed");
  }

  await stopRequested;
  const stopApps = running.map(
    ({ slug, child }) =>
      () =>
        stopGroup(slug, child.pid),
  );
  const closeProxy = () => proxy?.close();
  const stopPostgres = () =>
    exec("docker", ["compose", "stop"], { cwd: root, env }).catch(
      (error: unknown) => {
        // A failed compose up has said what is wrong; a stop that fails the
        // same way would only say it twice.
        if (!composeUpFailed) throw error;
      },
    );
  // The apps stop together, then the proxy, then Postgres. Each stage runs
  // even when one before it failed, so nothing is left running.
  for (const stage of [stopApps, [closeProxy], [stopPostgres]]) {
    failures.push(...(await failuresOf(stage)));
  }
  process.off("SIGINT", onSignal);
  process.off("SIGTERM", onSignal);
  throwFailures(failures);
  return outcome === "failed" ? 1 : 0;
}
