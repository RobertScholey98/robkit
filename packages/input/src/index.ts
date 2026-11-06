// Reading input from outside robkit's own code: environment variables,
// JSON, an app's slug and its manifest. Each reader returns the typed value
// or an InputProblem. It imports nothing, so the browser can load it. See
// docs/conventions/input.md.

export {
  allProblems,
  isProblem,
  isRecord,
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
export { readDevServerEnv, readGuardEnv, readServeEnv } from "./app-env.ts";
export {
  appDeclarationJson,
  readAppDeclaration,
  readDeclaredApp,
  type AppDeclaration,
  type DeclaredAccess,
  type DeclaredApp,
} from "./manifest.ts";
