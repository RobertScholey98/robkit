// What the guard needs to know about its app: the app's slug and core's
// origin. An app passes neither, and the guard reads them from the
// environment pnpm dev and robkit deploy set. An option it is given goes
// through the same reader, so a value typed in code is judged as one read
// from the environment.

import {
  allProblems,
  isProblem,
  orExit,
  readAppSlug,
  readCoreUrl,
  type CoreOrigin,
  type Slug,
} from "@robkit/input";

/** The guard's settings, each read from the environment when left out. */
export interface GuardSettings {
  /**
   * The app's slug, which is also its subdomain. `ROBKIT_APP` when left
   * out.
   */
  app?: string | undefined;
  /**
   * Core's public origin, such as `https://core.robkit.dev`.
   * `ROBKIT_CORE_URL` when left out.
   */
  core?: string | undefined;
}

const appOption = "guarded()'s app";
const coreOption = "guarded()'s core";

/**
 * The app's slug and core's origin: each one given, read again, and each
 * one left out read from the environment. A setting that won't do ends the
 * process with its reader's message and no stack, as an app's server does
 * with `orExit` as it starts.
 */
export function readGuardSettings({ app, core }: GuardSettings = {}): {
  app: Slug;
  core: CoreOrigin;
} {
  // A reader takes an environment, so an option is one with a single
  // variable, named as the problem names the option.
  const slug =
    app === undefined
      ? readAppSlug(process.env)
      : readAppSlug({ [appOption]: app }, appOption);
  const origin =
    core === undefined
      ? readCoreUrl(process.env)
      : readCoreUrl({ [coreOption]: core }, coreOption);
  return orExit(
    isProblem(slug) || isProblem(origin)
      ? allProblems(slug, origin)
      : { app: slug, core: origin },
  );
}
