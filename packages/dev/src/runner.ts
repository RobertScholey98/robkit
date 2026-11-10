import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { install } from "@robkit/input/addresses";
import { isProblem, type Slug } from "@robkit/input";
import { CommandProblem } from "@robkit/input/command";
import { appEnv, type InstallFacts, ownSettings } from "./app-env.ts";
import { untilAnswering } from "./answering.ts";
import {
  appManifestFileIn,
  catalogOf,
  discoverApps,
  routesFor,
  type App,
} from "./apps.ts";
import { checkBeforeStart, portForNewApp, proxyPortProblem } from "./checks.ts";
import { readDevConfig, withInstallEnv } from "./env.ts";
import { exec, prefixLines, startProblem } from "./exec.ts";
import { failuresOf, throwFailures } from "./failures.ts";
import { startProxy, type Proxy } from "./proxy.ts";
import { stopGroup } from "./process-group.ts";
import { provisionApps } from "./provision.ts";
import { serveRequests } from "./request-server.ts";
import { type Answered, type DevRequest, devSocket } from "./requests.ts";
import { requireGo } from "./toolchain.ts";

/** An app the runner started, and what its exit means. */
interface Running {
  app: App;
  child: ChildProcess;
  /**
   * Whether its exit stops the runner: true once it has answered, or from
   * the start for the apps found as the runner starts. An app being added,
   * and core while the runner restarts it, aren't watched.
   */
  watched: boolean;
  /** Settles with why it stopped, if it stops while it isn't watched. */
  exited: Promise<string>;
}

/** What a test changes about a run. */
export interface DevOptions {
  /**
   * How long an app started while the runner runs gets to answer on its
   * port: an added app, and the core started to list it. Five minutes
   * unless given, since a Go app compiles first, and its first build
   * fetches its modules.
   */
  startLimitMs?: number;
}

/**
 * What `error` says, a line for each failure in it, when the owner can fix
 * every one of them; otherwise undefined, for a fault.
 */
function problemsIn(error: unknown): string | undefined {
  if (error instanceof CommandProblem) return error.message;
  if (
    error instanceof AggregateError &&
    error.errors.every((each) => each instanceof CommandProblem)
  ) {
    return error.errors.map((each: CommandProblem) => each.message).join("\n");
  }
  return undefined;
}

/**
 * `robkit-dev`: runs the install in `root` for local development, refusing a
 * folder with no `robkit.json`. Finds the apps, refusing any folder that isn't a slug, or a Go app without Go, before
 * it starts anything. Starts Postgres, runs the provision step, starts every
 * app and puts the proxy in front. Stops it all on SIGINT, SIGTERM or
 * SIGHUP, when its output closes, or as soon as any app exits.
 *
 * While it runs, it listens on a socket file for requests to add an app,
 * or to migrate one, from the `robkit` command.
 *
 * @returns the exit code: 0 after a signal, 1 if an app exited
 * @throws what failed while starting or stopping, once everything stopped:
 *   one failure as it is, or several in an AggregateError
 */
export async function runDev(
  root: string,
  shell: NodeJS.ProcessEnv,
  { startLimitMs = 5 * 60_000 }: DevOptions = {},
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
  const facts: InstallFacts = {
    domain,
    coreUrl: addresses.origin("core"),
    catalog: catalogOf(apps),
  };
  const own = await ownSettings(facts, apps);
  // An app with a go.mod runs on Go. Say so before anything starts.
  if (apps.some((app) => existsSync(join(app.dir, "go.mod")))) {
    await requireGo(env);
  }
  // Before anything starts, and outside the stop below, so a second pnpm
  // dev stops nothing the first one runs.
  await checkBeforeStart({ root, env, devPort, postgresPort, apps });
  // An app and its migrate script get the same environment. An app being
  // added gets the install's facts with itself in the catalog.
  const envFor = (app: App, databaseUrl?: string, about = facts) =>
    appEnv(about, env, app, { own: own.get(app.slug), databaseUrl });

  // The first reason to stop wins; later signals or exits change nothing.
  let outcome: "interrupted" | "failed" | undefined;
  // What failed, thrown once everything has stopped.
  const failures: unknown[] = [];
  const { promise: stopRequested, resolve: wake } =
    Promise.withResolvers<undefined>();
  const stopController = new AbortController();
  const { signal } = stopController;
  const stop = (why: "interrupted" | "failed") => {
    outcome ??= why;
    stopController.abort();
    wake(undefined);
  };
  const stopping = () => outcome !== undefined;

  const running: Running[] = [];
  const databaseUrls = new Map<Slug, string>();
  let proxy: Proxy | undefined;
  // A request waits until the apps found at start are up, or have failed.
  const { promise: startedUp, resolve: markStarted } =
    Promise.withResolvers<undefined>();

  const start = (
    app: App,
    { watched, about = facts }: { watched: boolean; about?: InstallFacts },
  ): Running => {
    const child = spawn("pnpm", ["run", "dev"], {
      cwd: app.dir,
      env: envFor(app, databaseUrls.get(app.slug), about),
      // Its own process group, so stopping it reaches every process it spawns.
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    prefixLines(app.slug, child.stdout, process.stdout);
    prefixLines(app.slug, child.stderr, process.stderr);
    const { promise: exited, resolve: unwatchedExit } =
      Promise.withResolvers<string>();
    const entry: Running = { app, child, watched, exited };
    child.on("exit", (code, exitSignal) => {
      if (stopping()) return;
      const how = String(exitSignal ?? code);
      if (!entry.watched) {
        unwatchedExit(`${app.slug} exited with ${how} before it answered.`);
        return;
      }
      console.error(`${app.slug} exited (${how}), stopping`);
      stop("failed");
    });
    // Emitted instead of exit when the app can't start, such as pnpm
    // missing or its folder gone.
    child.on("error", (error) => {
      const problem = startProblem("pnpm", ["run", "dev"], app.dir, error);
      if (!entry.watched) {
        unwatchedExit(problem.message);
        return;
      }
      if (!stopping()) console.error(`${app.slug} couldn't start, stopping`);
      failures.push(problem);
      stop("failed");
    });
    running.push(entry);
    return entry;
  };

  const refused = (message: string): Answered => ({
    outcome: "refused",
    message,
  });
  const stoppingAnswer = refused(
    "pnpm dev stopped before it finished. Start it again, which starts every app in apps/.",
  );
  const runningApp = (slug: Slug) =>
    running.find((entry) => entry.app.slug === slug);

  const startLimit = `${String(startLimitMs / 60_000)} minutes`;

  /**
   * Waits for an app started unwatched to answer on its port. One that
   * exits first isn't running after, and one that doesn't answer within
   * the limit is stopped.
   *
   * @returns how the wait ended. `entry.exited` says why it exited.
   */
  const untilUp = async (
    entry: Running,
  ): Promise<"up" | "exited" | "silent" | "stopping"> => {
    const settled = new AbortController();
    const limit = AbortSignal.timeout(startLimitMs);
    const answered = await Promise.race([
      untilAnswering(
        entry.app.port,
        AbortSignal.any([signal, settled.signal, limit]),
      ),
      entry.exited,
    ]);
    settled.abort();
    // The stop that follows stops it with every other app.
    if (stopping()) return "stopping";
    if (answered === true) return "up";
    running.splice(running.indexOf(entry), 1);
    if (answered !== false) return "exited";
    await stopGroup(entry.app.slug, entry.child.pid);
    return "silent";
  };

  /**
   * Starts a new core with the catalog in `about`, since core reads
   * `ROBKIT_APPS` as it starts. It takes a free port, and once it answers
   * the proxy sends core's host there and the old core stops. Every app
   * reaches core through the proxy, so each app's guard finds one answering
   * throughout. Sessions are in the database, so nobody is signed out. In a
   * linked checkout core runs under Node's watch mode, so the old one's
   * whole process group stops.
   *
   * @returns why the new core isn't serving, when the old one still is
   */
  const restartCore = async (
    about: InstallFacts,
  ): Promise<string | undefined> => {
    const old = runningApp("core");
    if (!old) return undefined;
    const core: App = {
      ...old.app,
      port: await portForNewApp(
        devPort,
        running.map((entry) => entry.app.port),
      ),
    };
    const entry = start(core, { watched: false, about });
    const up = await untilUp(entry);
    if (up === "stopping") return undefined;
    if (up === "exited") return await entry.exited;
    if (up === "silent") {
      return `core didn't answer on port ${String(core.port)} within ${startLimit}.`;
    }
    // From here its exit stops pnpm dev, as the old one's did.
    entry.watched = true;
    for (const route of routesFor([core], domain)) proxy?.route(route);
    apps[apps.indexOf(old.app)] = core;
    old.watched = false;
    await stopGroup("core", old.child.pid);
    running.splice(running.indexOf(old), 1);
    return undefined;
  };

  const add = async (slug: Slug): Promise<Answered> => {
    const origin = addresses.origin(slug);
    if (runningApp(slug)) {
      return {
        outcome: "done",
        message: `${slug} is already running at ${origin}. pnpm dev changed nothing.`,
      };
    }
    const file = await appManifestFileIn(root, slug);
    if (!file) {
      return refused(
        `apps/${slug} has no package.json, so pnpm dev can't start it.`,
      );
    }
    const app: App = {
      slug,
      dir: join(root, "apps", slug),
      port: await portForNewApp(
        devPort,
        running.map((entry) => entry.app.port),
      ),
      migrates: file.scripts.migrate !== undefined,
      manifest: file.manifest,
    };
    const about = { ...facts, catalog: catalogOf([...apps, app]) };
    own.set(slug, (await ownSettings(about, [app])).get(slug) ?? {});
    const provisioned = await provisionApps([app], {
      adminUrl,
      envFor: (each, databaseUrl) => envFor(each, databaseUrl, about),
      signal,
    });
    for (const [each, url] of provisioned) databaseUrls.set(each, url);
    if (stopping()) return stoppingAnswer;

    const entry = start(app, { watched: false, about });
    const up = await untilUp(entry);
    if (up === "stopping") return stoppingAnswer;
    if (up === "exited") {
      return refused(`${await entry.exited} Its output is in pnpm dev's.`);
    }
    if (up === "silent") {
      return refused(
        `${slug} didn't answer on port ${String(app.port)} within ${startLimit}, so pnpm dev stopped it. Check that it listens on PORT.`,
      );
    }
    // From here its exit stops pnpm dev, as any running app's does.
    entry.watched = true;
    const coreProblem = await restartCore(about);
    if (stopping()) return stoppingAnswer;
    if (coreProblem !== undefined) {
      // Core never listed it, so the install runs on as it was.
      entry.watched = false;
      running.splice(running.indexOf(entry), 1);
      await stopGroup(slug, entry.child.pid);
      return refused(
        `${coreProblem} That was a new core, started to list ${slug}, so pnpm dev kept the core it had and stopped ${slug}. Core's output is in pnpm dev's.`,
      );
    }
    apps.push(app);
    facts.catalog = about.catalog;
    for (const route of routesFor([app], domain)) proxy?.route(route);
    console.log(`${slug} is ready at ${origin}`);
    return {
      outcome: "done",
      message: `pnpm dev started ${slug} at ${origin}.`,
    };
  };

  const migrate = async (slug: Slug): Promise<Answered> => {
    const entry = runningApp(slug);
    if (!entry) {
      return refused(
        `pnpm dev isn't running ${slug}. Start pnpm dev again, which starts and migrates every app in apps/.`,
      );
    }
    const databaseUrl = databaseUrls.get(slug);
    if (databaseUrl === undefined) {
      return refused(
        `${slug} has no database: its package.json had no migrate script when pnpm dev started it. Add one, then start pnpm dev again.`,
      );
    }
    // The URL it gave the app at start, so the app's password stays.
    await exec("pnpm", ["run", "migrate"], {
      cwd: entry.app.dir,
      env: envFor(entry.app, databaseUrl),
      slug,
      signal,
    });
    if (stopping()) return stoppingAnswer;
    return { outcome: "done", message: `pnpm dev migrated ${slug}.` };
  };

  /** Adds or migrates, answering a problem the owner can fix with it. */
  const answer = async ({ operation, slug }: DevRequest) => {
    try {
      return await (operation === "add" ? add(slug) : migrate(slug));
    } catch (error) {
      const problem = problemsIn(error);
      if (problem === undefined) throw error;
      return refused(problem);
    }
  };

  // Before the signals are caught, so a refused socket leaves nothing to
  // undo.
  const requests = await serveRequests(
    await devSocket(root, env),
    async (request) => {
      await startedUp;
      if (stopping()) return stoppingAnswer;
      const answered = await answer(request);
      if (answered.outcome === "refused" && answered !== stoppingAnswer) {
        console.error(
          `pnpm dev couldn't ${request.operation} ${request.slug}. ${answered.message}`,
        );
      }
      return answered;
    },
  );

  const onSignal = () => {
    stop("interrupted");
  };
  // A closed terminal sends SIGHUP and closes this process's output, so a
  // write to it then fails. With nobody left to read it, the runner stops
  // as it does on SIGINT, and ignores every failed write, so the stop
  // still finishes.
  const output = { gone: false };
  const onOutputGone = () => {
    output.gone = true;
    stop("interrupted");
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  process.on("SIGHUP", onOutputGone);
  process.stdout.on("error", onOutputGone);
  process.stderr.on("error", onOutputGone);

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

    for (const [slug, url] of await provisionApps(apps, {
      adminUrl,
      envFor,
      signal,
    })) {
      databaseUrls.set(slug, url);
    }

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
      for (const app of apps) start(app, { watched: true });
      // Each address once its app answers, so the first click doesn't get
      // the proxy's "is not answering".
      for (const app of apps) {
        void untilAnswering(app.port, signal).then((up) => {
          if (up && !stopping()) {
            console.log(
              `${app.slug} is ready at ${addresses.origin(app.slug)}`,
            );
          }
        });
      }
    }
  } catch (error) {
    failures.push(error);
    stop("failed");
  } finally {
    markStarted(undefined);
  }

  await stopRequested;
  // The socket first, after the request in hand, so no app starts once
  // the apps below are stopped.
  failures.push(...(await failuresOf([() => requests.close()])));
  const stopApps = running.map(
    ({ app, child }) =>
      () =>
        stopGroup(app.slug, child.pid),
  );
  const closeProxy = () => proxy?.close();
  const stopPostgres = () =>
    // With the output gone, Compose prints nowhere: a write to a closed
    // pipe would end it before it stopped Postgres.
    exec("docker", ["compose", "stop"], {
      cwd: root,
      env,
      quiet: output.gone,
    }).catch((error: unknown) => {
      // A failed compose up has said what is wrong; a stop that fails the
      // same way would only say it twice.
      if (!composeUpFailed) throw error;
    });
  // The apps stop together, then the proxy, then Postgres. Each stage runs
  // even when one before it failed, so nothing is left running.
  for (const stage of [stopApps, [closeProxy], [stopPostgres]]) {
    failures.push(...(await failuresOf(stage)));
  }
  process.off("SIGINT", onSignal);
  process.off("SIGTERM", onSignal);
  process.off("SIGHUP", onOutputGone);
  // Once the output is gone, a line still on its way from an app must not
  // end the process before it exits.
  if (!output.gone) {
    process.stdout.off("error", onOutputGone);
    process.stderr.off("error", onOutputGone);
  }
  throwFailures(failures);
  return outcome === "failed" ? 1 : 0;
}
