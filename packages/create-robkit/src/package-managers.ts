import { format } from "prettier";
import { parseDocument } from "yaml";
import type { PackageManager } from "./choices.ts";
import type { Files } from "./generate.ts";
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
  /** The files that hold the manager's settings. */
  readonly settingsFiles: readonly string[];
  /** The lockfile an install writes. */
  readonly lockfile: string;
  /** Installs a new install's dependencies, which have no lockfile yet. */
  readonly install: string;
  /** How a person runs one of the install's scripts, arguments included. */
  run(script: string): string;
  /** The root manifest's `packageManager`, such as `pnpm@11.28.9`. */
  packageManagerOf(repo: RobkitRepo): string;
  /** Writes each of `settings` into its settings file in `files`. */
  writeSettings(files: Files, settings: Settings): Promise<void>;
  /** The overrides the settings files in `files` hold. */
  overridesIn(files: Files): Record<string, string>;
  /**
   * A template file's text with the pnpm commands and files it names
   * spelled for this manager. The templates are written for pnpm.
   */
  spell(text: string): string;
}

const pnpmSettings = "pnpm-workspace.yaml";

const pnpm: PackageManagerAdapter = {
  settingsFiles: [pnpmSettings],
  lockfile: "pnpm-lock.yaml",
  // pnpm on CI refuses an install with no lockfile unless told.
  install: "pnpm install --no-frozen-lockfile",
  run: (script) => `pnpm ${script}`,
  packageManagerOf: (repo) => repo.packageManager,
  async writeSettings(files, { catalog, builds, overrides }) {
    const workspace = parseDocument(files.get(pnpmSettings) ?? "");
    for (const [name, allowed] of Object.entries(builds ?? {})) {
      workspace.setIn(["allowBuilds", name], allowed);
    }
    if (catalog) workspace.set("catalog", catalog);
    for (const [name, spec] of Object.entries(overrides ?? {})) {
      workspace.setIn(["overrides", name], spec);
    }
    files.set(
      pnpmSettings,
      await format(workspace.toString(), { filepath: pnpmSettings }),
    );
  },
  overridesIn(files) {
    const workspace = parseDocument(files.get(pnpmSettings) ?? "").toJS() as {
      overrides?: Record<string, string>;
    };
    return workspace.overrides ?? {};
  },
  spell: (text) => text,
};

/**
 * Each package manager init offers, by name. Adding one is an entry here,
 * its option in the choice table, and its template layer, which brings its
 * settings file, Dockerfile and CI workflow.
 */
export const packageManagers: Record<PackageManager, PackageManagerAdapter> = {
  pnpm,
};
