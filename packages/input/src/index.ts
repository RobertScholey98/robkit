// Reading input from outside robkit's own code: environment variables,
// JSON and an app's slug. Each reader returns the typed value or an
// InputProblem. It imports nothing, so the browser can load it. The manifest
// format, an install's addresses and Report are subpaths of their own. See
// docs/conventions/input.md.

export {
  allProblems,
  isProblem,
  isRecord,
  orThrow,
  type InputProblem,
} from "./problem.ts";
export { parseJson } from "./json.ts";
export {
  isDomain,
  readAppSlug,
  readCoreUrl,
  readDatabaseUrl,
  readDomain,
  readHost,
  readPort,
  readSet,
  type CoreOrigin,
  type Domain,
  type Env,
} from "./env.ts";
export {
  isPlatformApp,
  platformApps,
  readSlug,
  slugProblem,
  type PlatformApp,
  type Slug,
} from "./slug.ts";
export {
  orExit,
  readDevServerEnv,
  readGuardEnv,
  readServeEnv,
} from "./app-env.ts";
