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
  /**
   * A template file's text with the pnpm commands and files it names
   * spelled for this manager. The templates are written for pnpm.
   */
  spell(text: string): string;
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
  spell: (text) => text,
};

type Json = Record<string, unknown>;

/**
 * How bun spells what the templates name for pnpm, in the order they apply.
 * bun runs a script as `bun run <script>`: `bun test` and `bun build` are
 * its own commands, not the install's scripts.
 */
const bunSpellings: [RegExp, string][] = [
  [
    /under `catalog:` in `pnpm-workspace\.yaml`/g,
    "under `workspaces.catalog` in `package.json`",
  ],
  [/pnpm-workspace\.yaml/g, "package.json"],
  [/pnpm-lock\.yaml/g, "bun.lock"],
  [/\bpnpm exec /g, "bunx "],
  [/\bpnpm install\b/g, "bun install"],
  [/\bpnpm (run )?(?=[\w:-])/g, "bun run "],
];

/**
 * Spells one line for bun. A line that lines its comment up, as a command
 * list does, keeps the comment in the same column.
 */
function spellLineForBun(line: string): string {
  let spelled = line;
  for (const [pnpmSpelling, bunSpelling] of bunSpellings) {
    spelled = spelled.replace(pnpmSpelling, bunSpelling);
  }
  const comment = linedUpComment.exec(line);
  return comment === null || spelled === line
    ? spelled
    : alignComment(spelled, line.indexOf("# ", comment.index));
}

/** Code, then at least two spaces, then a `# ` comment. */
const linedUpComment = /\S {2,}# /;

/** Moves a line's lined-up comment to `column`, keeping a space before it. */
function alignComment(line: string, column: number): string {
  const comment = linedUpComment.exec(line);
  if (comment === null) return line;
  const code = line.slice(0, comment.index + 1);
  const text = line.slice(line.indexOf("# ", comment.index));
  return `${code}${" ".repeat(Math.max(1, column - code.length))}${text}`;
}

const bun: PackageManagerAdapter = {
  settingsFile: "package.json",
  lockfile: "bun.lock",
  install: "bun install",
  run: (script) => `bun run ${script}`,
  packageManagerOf(repo) {
    const version = repo.catalog.get("bun");
    if (version === undefined)
      throw new Error("bun has no version in robkit's catalog");
    return `bun@${version}`;
  },
  async writeSettings(text, { catalog, builds, overrides }) {
    const manifest = JSON.parse(text) as Json;
    if (catalog) {
      manifest.workspaces = {
        ...(manifest.workspaces as Json | undefined),
        catalog,
      };
    }
    if (builds) {
      // Naming them all means bun's own list of trusted packages never
      // applies: only these run their install scripts.
      manifest.trustedDependencies = Object.entries(builds)
        .filter(([, allowed]) => allowed)
        .map(([name]) => name)
        .sort();
    }
    if (overrides) {
      manifest.overrides = {
        ...(manifest.overrides as Json | undefined),
        ...overrides,
      };
    }
    return format(JSON.stringify(manifest), { filepath: this.settingsFile });
  },
  overridesIn(text) {
    const { overrides } = JSON.parse(text) as {
      overrides?: Record<string, string>;
    };
    return overrides ?? {};
  },
  spell: (text) => text.split("\n").map(spellLineForBun).join("\n"),
};

/**
 * Each package manager init offers, by name. Adding one is an entry here,
 * its option in the choice table, and its template layer, which brings its
 * settings file, Dockerfile and CI workflow.
 */
export const packageManagers: Record<PackageManager, PackageManagerAdapter> = {
  pnpm,
  bun,
};
