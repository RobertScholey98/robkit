// The docs site's sh and go fences: each pnpm command a page shows is one
// an install has, robkit's checkout has in a fence marked `checkout`, or
// an app has in a fence marked `app`, and each Go sample is as gofmt
// writes it.

import { spawnSync } from "node:child_process";
import { glob, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fencesIn, type Fence } from "./doc-examples.ts";
import { sitePageGlobs } from "./site-pages.ts";

/** Every fence in the site's pages, in path order. */
export async function siteFences(root: string): Promise<Fence[]> {
  const files: string[] = [];
  for await (const file of glob(sitePageGlobs, { cwd: root })) {
    files.push(file.replaceAll("\\", "/"));
  }
  files.sort();
  const fences = await Promise.all(
    files.map(async (file) =>
      fencesIn(file, await readFile(join(root, file), "utf8")),
    ),
  );
  return fences.flat();
}

/**
 * pnpm's own commands a page may show, which aren't scripts. Anything else
 * after `pnpm` must be a script the install's package.json has.
 */
const pnpmCommands = new Set([
  "install",
  "i",
  "add",
  "remove",
  "update",
  "exec",
  "dlx",
  "why",
  "list",
  "outdated",
]);

export interface InstallCommands {
  /** The commands `robkit` runs. */
  robkit: readonly string[];
  /** The scripts the install's package.json has. */
  scripts: readonly string[];
  /** The scripts robkit's own package.json has, for a fence marked `checkout`. */
  checkout: readonly string[];
  /** The scripts every Node stack's app has, for a fence marked `app`. */
  app: readonly string[];
}

/** The scripts a fence's commands may run, and whose they are. */
function scriptsFor(
  flags: readonly string[],
  install: InstallCommands,
): [readonly string[], string] {
  if (flags.includes("checkout")) {
    return [install.checkout, "robkit's own package.json"];
  }
  if (flags.includes("app")) return [install.app, "an app's package.json"];
  return [install.scripts, "an install's package.json"];
}

/** Each shell command in a fence, one per line, split at `&&`, `||`, `;` and `|`. */
function commandsIn(code: string): { offset: number; words: string[] }[] {
  return code.split("\n").flatMap((text, offset) =>
    text
      .replace(/^\s*\$\s+/, "")
      .replace(/(^|\s)#.*$/, "")
      .split(/&&|\|\||;|\|/)
      .map((command) => ({ offset, words: command.trim().split(/\s+/) })),
  );
}

/**
 * Each `pnpm robkit <command>` in an `sh` fence whose command `robkit`
 * doesn't run, and each `pnpm <script>` the install has no script for. A
 * fence marked `checkout` runs in a clone of robkit, so its scripts are
 * robkit's own. One marked `app` runs in an app's folder.
 */
export function commandProblems(
  fences: readonly Fence[],
  install: InstallCommands,
): string[] {
  return fences
    .filter(({ lang }) => lang === "sh")
    .flatMap(({ file, line, code, flags }) => {
      const [scripts, owner] = scriptsFor(flags, install);
      return commandsIn(code).flatMap(
        ({ offset, words: [first, name, sub] }) => {
          const at = `${file}:${String(line + offset)}`;
          if (first !== "pnpm" || name === undefined || name.startsWith("-")) {
            return [];
          }
          if (name === "robkit") {
            return sub !== undefined && install.robkit.includes(sub)
              ? []
              : [
                  `${at}: robkit has no ${sub === undefined ? "command there" : `${sub} command`}. Its commands are ${install.robkit.join(", ")}.`,
                ];
          }
          const script = name === "run" ? sub : name;
          if (name !== "run" && pnpmCommands.has(name)) return [];
          return script !== undefined && scripts.includes(script)
            ? []
            : [
                `${at}: ${owner} has no ${String(script)} script, and it isn't one of pnpm's own commands. Its scripts are ${scripts.join(", ")}.`,
              ];
        },
      );
    });
}

/**
 * Each `go` fence that gofmt would change or can't read. Runs gofmt, which
 * comes with Go: CONTRIBUTING.md says to install Go.
 */
export function goFormatProblems(fences: readonly Fence[]): string[] {
  return fences
    .filter(({ lang }) => lang === "go")
    .flatMap(({ file, line, code }) => {
      const run = spawnSync("gofmt", ["-l"], { input: code, encoding: "utf8" });
      if (run.error !== undefined) {
        throw new Error(
          `Couldn't run gofmt to check ${file}:${String(line)}. Install Go, as CONTRIBUTING.md says.`,
          { cause: run.error },
        );
      }
      if (run.status !== 0) {
        return [
          `${file}:${String(line)}: gofmt can't read it: ${run.stderr.trim()}`,
        ];
      }
      return run.stdout.trim() === ""
        ? []
        : [
            `${file}:${String(line)}: gofmt would change it. Run the code through gofmt.`,
          ];
    });
}
