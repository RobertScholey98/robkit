import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { ESLint } from "eslint";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultChoices } from "./choices.ts";
import { generateInstall } from "./generate.ts";

// A new install lints with the policy robkit lints itself with. These
// samples break it, and the install's config and robkit's must both refuse
// each one, with the same rules.

const samples = {
  "a fixed error with no cause": `
export function load(): never {
  throw new Error("Something broke.");
}
`,
  "a rethrow that drops the cause": `
export function load(read: () => string): string {
  try {
    return read();
  } catch (error) {
    throw new Error(\`Couldn't load: \${String(error)}\`);
  }
}
`,
  "a catch that drops its error": `
export function load(read: () => string): string | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}
`,
  "a cast of parsed JSON": `
export function load(text: string): { name: string } {
  return JSON.parse(text) as { name: string };
}
`,
  "a failed read of its own": `
export function check(): { error: string } | undefined {
  return undefined;
}
`,
  "a cast to a brand": `
declare const brand: unique symbol;
type Slug = string & { readonly [brand]: true };
export const notes = "notes" as Slug;
`,
  "a suppression with no reason": `
// eslint-disable-next-line no-debugger
debugger;
`,
};

type Sample = keyof typeof samples;

/** The rules each sample breaks, as both configs report them. */
const refused: Record<Sample, string[]> = {
  "a fixed error with no cause": ["robkit/no-bare-error"],
  "a rethrow that drops the cause": ["preserve-caught-error"],
  "a catch that drops its error": ["robkit/no-silent-catch"],
  "a cast of parsed JSON": [
    "@typescript-eslint/no-unsafe-type-assertion",
    "robkit/no-json-cast",
  ],
  "a failed read of its own": ["robkit/one-problem-type"],
  "a cast to a brand": [
    "@typescript-eslint/no-unsafe-type-assertion",
    "robkit/no-brand-cast",
  ],
  "a suppression with no reason": [
    "@eslint-community/eslint-comments/require-description",
  ],
};

const require = createRequire(import.meta.url);
/** robkit's own lint config, in tooling/eslint. */
const robkitConfig = require.resolve("@internal/eslint-config");

/** What the policy imports, which an install's root manifest names. */
const policyPackages = [
  "@eslint-community/eslint-plugin-eslint-comments",
  "@eslint/js",
  "eslint",
  "globals",
  "typescript-eslint",
];

let dir = "";
const found = new Map<string, Record<string, string[]>>();

/** The rules ESLint fails each sample on, with the config file `config`. */
async function refusedBy(config: string): Promise<Record<string, string[]>> {
  const eslint = new ESLint({ cwd: dir, overrideConfigFile: config });
  const results = await eslint.lintFiles(["samples/*.ts"]);
  return Object.fromEntries(
    results.map((result) => [
      result.filePath,
      [
        ...new Set(
          result.messages
            .filter((message) => message.severity === 2)
            .map((message) => message.ruleId ?? "unused directive"),
        ),
      ].sort(),
    ]),
  );
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "robkit-install-lint-"));
  const files = await generateInstall(defaultChoices);
  for (const [path, text] of files) {
    if (path !== "eslint.config.js" && !path.startsWith("tooling/")) continue;
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), text);
  }
  // An install takes the policy's packages from its root; robkit's
  // tooling/eslint holds the same ones, from the same catalog. Each link
  // goes to the package's real folder, since pnpm's own links are relative.
  const packages = join(dirname(robkitConfig), "node_modules");
  for (const name of policyPackages) {
    const link = join(dir, "node_modules", name);
    await mkdir(dirname(link), { recursive: true });
    await symlink(await realpath(join(packages, name)), link, "junction");
  }
  await writeFile(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      extends: "./tooling/typescript/base.json",
      include: ["samples"],
    }),
  );
  await writeFile(
    join(dir, "robkit.eslint.config.js"),
    `import { config } from ${JSON.stringify(pathToFileURL(robkitConfig).href)};\nexport default config(import.meta.dirname);\n`,
  );
  await mkdir(join(dir, "samples"));
  const names = Object.keys(samples);
  for (const [i, code] of Object.values(samples).entries()) {
    await writeFile(join(dir, "samples", `sample-${String(i)}.ts`), code);
  }
  const [install, robkit] = await Promise.all([
    refusedBy(join(dir, "eslint.config.js")),
    refusedBy(join(dir, "robkit.eslint.config.js")),
  ]);
  names.forEach((name, i) => {
    const file = join(dir, "samples", `sample-${String(i)}.ts`);
    found.set(name, {
      install: install[file] ?? [],
      robkit: robkit[file] ?? [],
    });
  });
}, 60_000);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

describe("a new install's lint", () => {
  it.each(Object.keys(refused) as Sample[])(
    "refuses %s, as robkit's does",
    (sample) => {
      expect(found.get(sample)).toEqual({
        install: refused[sample],
        robkit: refused[sample],
      });
    },
  );
});
