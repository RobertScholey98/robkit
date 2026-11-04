import { format } from "prettier";
import { parseDocument } from "yaml";
import type { PackageManager } from "./choices.ts";
import type { RobkitRepo } from "./robkit-repo.ts";

/**
 * What an install's package manager settings hold. Every manager keeps the
 * same things, each in its own file and shape.
 */
export interface Settings {
  /** Every external version, by dependency. */
  catalog?: Record<string, string>;
  /**
   * The dependencies with install scripts: `true` for one the install must
   * run, `false` for one it can skip. The manager runs no other.
   */
  builds?: Record<string, boolean>;
  /** Specs that replace a dependency's version everywhere, by dependency. */
  overrides?: Record<string, string>;
}

/** Everything about an install that differs per package manager. */
export interface PackageManagerAdapter {
  /** The file that holds the manager's settings. */
  readonly settingsFile: string;
  /** The lockfile an install writes. */
  readonly lockfile: string;
  /** Installs a new install's dependencies, which have no lockfile yet. */
  readonly install: string;
  /** How a person runs one of the install's scripts, arguments included. */
  run(script: string): string;
  /** The root manifest's `packageManager`, such as `pnpm@11.28.9`. */
  packageManagerOf(repo: RobkitRepo): string;
  /** The settings file's text with each of `settings` written into it. */
  writeSettings(text: string, settings: Settings): Promise<string>;
  /** The overrides the settings file's text holds. */
  overridesIn(text: string): Record<string, string>;
}

const pnpm: PackageManagerAdapter = {
  settingsFile: "pnpm-workspace.yaml",
  lockfile: "pnpm-lock.yaml",
  // pnpm on CI refuses an install with no lockfile unless told.
  install: "pnpm install --no-frozen-lockfile",
  run: (script) => `pnpm ${script}`,
  packageManagerOf: (repo) => repo.packageManager,
  async writeSettings(text, { catalog, builds, overrides }) {
    const workspace = parseDocument(text);
    for (const [name, allowed] of Object.entries(builds ?? {})) {
      workspace.setIn(["allowBuilds", name], allowed);
    }
    if (catalog) workspace.set("catalog", catalog);
    for (const [name, spec] of Object.entries(overrides ?? {})) {
      workspace.setIn(["overrides", name], spec);
    }
    return format(workspace.toString(), { filepath: this.settingsFile });
  },
  overridesIn(text) {
    const workspace = parseDocument(text).toJS() as {
      overrides?: Record<string, string>;
    };
    return workspace.overrides ?? {};
  },
};

/**
 * Each package manager init offers, by name. Adding one is an entry here,
 * its option in the choice table, and its template layer, which brings its
 * settings file, Dockerfile and CI workflow.
 */
export const packageManagers: Record<PackageManager, PackageManagerAdapter> = {
  pnpm,
};
