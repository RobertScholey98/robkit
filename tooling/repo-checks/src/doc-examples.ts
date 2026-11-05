import { glob, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { publishedPackages } from "./published.ts";

/** The checkout's root folder. */
export const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

/** The docs whose examples must compile, relative to the root. */
const docGlobs = [
  "README.md",
  "CONTRIBUTING.md",
  "AGENTS.md",
  "docs/**/*.md",
  "packages/*/README.md",
];

/** One TypeScript fence in a doc. */
export interface DocExample {
  /** The doc, relative to the root, with forward slashes. */
  file: string;
  /** The doc's line that holds the fence's first line of code. */
  line: number;
  lang: "ts" | "tsx";
  code: string;
}

const fence = /^( *)(`{3,}|~{3,})\s*(.*)$/;

/**
 * Every `ts` and `tsx` fence in a markdown file, except those marked
 * `ts nocheck`, with a list item's indent taken off.
 */
export function examplesIn(file: string, markdown: string): DocExample[] {
  const examples: DocExample[] = [];
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const open = fence.exec(lines[i] ?? "");
    if (!open) continue;
    const [, indent = "", marker = "", info = ""] = open;
    const end = lines.findIndex((text, j) => j > i && text.trim() === marker);
    const close = end === -1 ? lines.length : end;
    const [lang, ...flags] = info.trim().split(/\s+/);
    if ((lang === "ts" || lang === "tsx") && !flags.includes("nocheck")) {
      const code = lines
        .slice(i + 1, close)
        .map((text) =>
          text.startsWith(indent) ? text.slice(indent.length) : text,
        )
        .join("\n");
      examples.push({ file, line: i + 2, lang, code: `${code}\n` });
    }
    i = close;
  }
  return examples;
}

/** The TypeScript examples in every doc the check covers. */
export async function docExamples(root: string): Promise<DocExample[]> {
  const files: string[] = [];
  for await (const file of glob(docGlobs, { cwd: root })) {
    files.push(file.replaceAll("\\", "/"));
  }
  files.sort();
  const examples = await Promise.all(
    files.map(async (file) =>
      examplesIn(file, await readFile(join(root, file), "utf8")),
    ),
  );
  return examples.flat();
}

interface Manifest {
  name: string;
  publishConfig?: {
    exports?: Record<string, string | { types?: string }>;
  };
}

/**
 * Maps each published entry point, such as `@robkit/session/addresses`, to
 * its built declarations, so an example sees what an install gets from npm.
 */
async function builtEntries(): Promise<Record<string, string[]>> {
  const paths: Record<string, string[]> = {};
  for (const dir of await publishedPackages()) {
    const manifest = JSON.parse(
      await readFile(join(dir, "package.json"), "utf8"),
    ) as Manifest;
    const exports = manifest.publishConfig?.exports ?? {};
    for (const [subpath, target] of Object.entries(exports)) {
      if (typeof target === "string" || target.types === undefined) continue;
      paths[`${manifest.name}${subpath.slice(1)}`] = [join(dir, target.types)];
    }
  }
  return paths;
}

/** The repo's shared compiler options, as every package typechecks with. */
function baseOptions(root: string): ts.CompilerOptions {
  const path = join(root, "tooling/typescript/base.json");
  const parsed = ts.getParsedCommandLineOfConfigFile(path, undefined, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      );
    },
  });
  if (!parsed) throw new Error(`Couldn't read ${path}.`);
  return parsed.options;
}

const howToFix =
  "  Make the example compile against the built packages. If it is deliberately not a whole program, such as a signature or a fragment, mark its fence ```ts nocheck.";

/**
 * Typechecks each example as its own module, with the repo's compiler options
 * and the published packages' built declarations. Third-party imports resolve
 * from `tooling/repo-checks`, so a package an example imports must be one of
 * its dev dependencies. Returns a line for each error, naming the doc and line.
 */
export async function exampleProblems(
  root: string,
  examples: DocExample[],
): Promise<string[]> {
  const options: ts.CompilerOptions = {
    ...baseOptions(root),
    types: ["node"],
    typeRoots: [join(root, "tooling/repo-checks/node_modules/@types")],
    jsx: ts.JsxEmit.ReactJSX,
    moduleDetection: ts.ModuleDetectionKind.Force,
    paths: await builtEntries(),
    noEmit: true,
  };
  const home = join(root, "tooling/repo-checks/doc-examples");
  const byPath = new Map(
    examples.map((example, i) => [
      join(home, `example-${String(i)}.${example.lang}`).replaceAll("\\", "/"),
      example,
    ]),
  );

  const host = ts.createCompilerHost(options);
  const fileExists = host.fileExists.bind(host);
  const read = host.readFile.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  host.fileExists = (path) => byPath.has(path) || fileExists(path);
  host.readFile = (path) => byPath.get(path)?.code ?? read(path);
  host.getSourceFile = (path, version, ...rest) => {
    const example = byPath.get(path);
    return example
      ? ts.createSourceFile(path, example.code, version)
      : getSourceFile(path, version, ...rest);
  };

  const program = ts.createProgram([...byPath.keys()], options, host);
  const optionProblems = program.getOptionsDiagnostics();
  if (optionProblems.length > 0) {
    throw new Error(
      ts.formatDiagnostics(optionProblems, {
        getCanonicalFileName: (name) => name,
        getCurrentDirectory: () => root,
        getNewLine: () => "\n",
      }),
    );
  }

  return [...byPath].flatMap(([path, example]) => {
    const source = program.getSourceFile(path);
    return ts.getPreEmitDiagnostics(program, source).map((diagnostic) => {
      const line =
        diagnostic.file && diagnostic.start !== undefined
          ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line
          : 0;
      const message = ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        "\n",
      );
      return `${example.file}:${String(example.line + line)}: ${message}\n${howToFix}`;
    });
  });
}
