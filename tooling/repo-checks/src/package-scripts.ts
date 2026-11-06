import { glob } from "node:fs/promises";
import { join } from "node:path";
import { readJsonFile, readNamedManifest } from "./manifest.ts";

export const scripts = [
  "build",
  "lint",
  "typecheck",
  "test",
  "test:unit",
] as const;

export type Script = (typeof scripts)[number];

/** A package excused from some scripts, and why. */
export type Exceptions = Readonly<
  Record<string, { without: readonly Script[]; reason: string }>
>;

/**
 * The packages with tests that may leave out a script the gates run. A
 * package goes here only when it can't have the script, and says why.
 */
export const exceptions: Exceptions = {
  "@internal/e2e": {
    without: ["test:unit"],
    reason: "Every test runs installs against Postgres in Docker.",
  },
  "@internal/test-postgres": {
    without: ["test:unit"],
    reason: "Every test starts containers in Docker.",
  },
  "@internal/eslint-config": {
    without: ["typecheck"],
    reason: "It is plain JavaScript, which ESLint loads as it is.",
  },
};

export interface PackageScripts {
  name: string;
  private: boolean;
  scripts: Readonly<Record<string, string>>;
}

const why: Record<Script, string> = {
  build: "A published package builds to dist.",
  lint: "Both gates run it.",
  typecheck: "Both gates run it.",
  test: "pnpm check:all runs it.",
  "test:unit":
    "Run the tests that need no Docker with it, so pnpm check runs them, or list the package in package-scripts.ts's exceptions with why it can't.",
};

/**
 * What's wrong with the scripts of `packages`, each a package with tests:
 * every one defines lint, typecheck, test and test:unit, and a published
 * one build, unless `exceptions` excuses it. An exception that excuses a
 * script the package has, or a package without tests, is wrong too.
 */
export function scriptProblems(
  packages: readonly PackageScripts[],
  excused: Exceptions = exceptions,
): string[] {
  const problems = packages.flatMap(
    ({ name, private: isPrivate, scripts: defined }) => {
      const without = excused[name]?.without ?? [];
      return scripts.flatMap((script) => {
        const has = script in defined;
        if (without.includes(script)) {
          return has
            ? [
                `${name} has a ${script} script, so package-scripts.ts's exceptions needn't excuse it.`,
              ]
            : [];
        }
        if (has || (script === "build" && isPrivate)) return [];
        return [`${name} has no ${script} script. ${why[script]}`];
      });
    },
  );
  const names = new Set(packages.map(({ name }) => name));
  for (const name of Object.keys(excused)) {
    if (!names.has(name)) {
      problems.push(`package-scripts.ts excuses ${name}, which has no tests.`);
    }
  }
  return problems;
}

/** Each workspace package with a test script, and its scripts. */
export async function readWorkspaceScripts(
  root: string,
): Promise<PackageScripts[]> {
  const packages: PackageScripts[] = [];
  for await (const path of glob("{packages,tooling}/*/package.json", {
    cwd: root,
  })) {
    const json = await readJsonFile(join(root, path), readNamedManifest);
    const defined = json.scripts ?? {};
    if (defined.test === undefined) continue;
    packages.push({
      name: json.name,
      private: json.private === true,
      scripts: defined,
    });
  }
  return packages.sort((a, b) => a.name.localeCompare(b.name));
}
