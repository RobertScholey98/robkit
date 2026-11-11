// What an install and create-robkit use beside the runner: the apps under
// apps/, and the names an app's .env can't set. @robkit/provision holds the
// provision step. The robkit-dev bin imports the runner's parts directly,
// and the command-line helpers are in ./cli.ts.

export {
  appManifestFileIn,
  catalogOf,
  discoverApps,
  type App,
  type AppManifestFile,
} from "./apps.ts";
export { refusedAppSettings } from "./app-env.ts";
