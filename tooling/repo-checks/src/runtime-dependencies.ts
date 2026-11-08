// An install's production image installs each app's `dependencies` alone
// (the template's AGENTS.md, "Production"). So a package that an app's
// server imports at run time must be under `dependencies`, or the
// container stops with ERR_MODULE_NOT_FOUND. A package only Vite bundles,
// such as React in the hub, rightly stays a dev dependency.
//
// This check starts where a container starts: each `node <file>` in a
// template's `start` script, and in the scripts it runs with
// `node --run`. A built `dist/<name>.js` stands for `src/<name>.ts`. From
// there it follows relative imports and workspace packages' exports, and
// fails each package imported for its value that the importing file's own
// manifest doesn't list under `dependencies` (or, in a shared package,
// `peerDependencies`). Type-only imports are skipped. An import whose path
// isn't a string literal, such as Start's built server, isn't followed.

import { glob, readFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import { join, posix, relative } from "node:path";
import { isRecord } from "@robkit/input";
import ts from "typescript";
import type { ScannedFile } from "./glossary.ts";

interface Manifest {
  /** The folder holding the manifest, from the templates' root. */
  dir: string;
  name: string | undefined;
  scripts: Record<string, string>;
  /** What the package may import at run time. */
  runtime: Set<string>;
  /** Its dependencies that are other workspace packages. */
  workspace: Set<string>;
  exports: Record<string, string>;
}

function strings(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) =>
      typeof entry === "string" ? [[key, entry]] : [],
    ),
  );
}

function readManifest(dir: string, text: string): Manifest {
  const json: unknown = JSON.parse(text);
  const fields = isRecord(json) ? json : {};
  const dependencies = strings(fields.dependencies);
  const peers = strings(fields.peerDependencies);
  const exports = isRecord(fields.exports)
    ? strings(fields.exports)
    : typeof fields.exports === "string"
      ? { ".": fields.exports }
      : {};
  return {
    dir,
    name: typeof fields.name === "string" ? fields.name : undefined,
    scripts: strings(fields.scripts),
    runtime: new Set([...Object.keys(dependencies), ...Object.keys(peers)]),
    workspace: new Set(
      Object.entries(dependencies).flatMap(([name, spec]) =>
        spec.startsWith("workspace:") ? [name] : [],
      ),
    ),
    exports,
  };
}

/** `@scope/name/sub` is `@scope/name`; `name/sub` is `name`. */
function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@")
    ? parts.slice(0, 2).join("/")
    : (parts[0] ?? specifier);
}

/** The modules `code` imports for their values, as written. */
export function runtimeImports(code: string, file: string): string[] {
  const source = ts.createSourceFile(
    file,
    code,
    ts.ScriptTarget.Latest,
    false,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const typesOnly =
        clause !== undefined &&
        (clause.phaseModifier === ts.SyntaxKind.TypeKeyword ||
          (clause.name === undefined &&
            bindings !== undefined &&
            ts.isNamedImports(bindings) &&
            bindings.elements.length > 0 &&
            bindings.elements.every((element) => element.isTypeOnly)));
      if (!typesOnly) found.push(node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      !node.isTypeOnly
    ) {
      found.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      found.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** The files a script starts with `node`, and the scripts it runs with `node --run`. */
function startedBy(command: string): { files: string[]; scripts: string[] } {
  const files: string[] = [];
  const scripts: string[] = [];
  for (const step of command.split(/&&|;|\|\|/)) {
    const words = step.trim().split(/\s+/);
    const node = words.indexOf("node");
    if (node === -1) continue;
    const rest = words.slice(node + 1);
    const run = rest.indexOf("--run");
    const script = run === -1 ? undefined : rest[run + 1];
    if (script !== undefined) {
      scripts.push(script);
      continue;
    }
    const file = rest.find((word) => !word.startsWith("-"));
    if (file !== undefined) files.push(file);
  }
  return { files, scripts };
}

/**
 * Each place in the templates (`files`, keyed by path from the templates'
 * root) where a server imports a package its manifest keeps out of a
 * production install.
 */
export function runtimeDependencyProblems(
  files: ReadonlyMap<string, string>,
): string[] {
  const manifests = [...files]
    .filter(([path]) => posix.basename(path) === "package.json")
    .map(([path, text]) => readManifest(posix.dirname(path), text));
  const byName = new Map(
    manifests.flatMap((manifest) =>
      manifest.name === undefined ? [] : [[manifest.name, manifest] as const],
    ),
  );
  const problems: string[] = [];
  const seen = new Set<string>();

  /** The source file `path` names, trying TypeScript's extensions. */
  const sourceOf = (path: string): string | undefined => {
    const bare = path.replace(/\.js$/, "");
    return [path, `${bare}.ts`, `${bare}.tsx`].find((p) => files.has(p));
  };

  const walk = (path: string, owner: Manifest): void => {
    if (seen.has(path)) return;
    seen.add(path);
    const code = files.get(path) ?? "";
    for (const specifier of runtimeImports(code, path)) {
      if (specifier.startsWith(".")) {
        const target = sourceOf(
          posix.join(posix.dirname(path), specifier.split("?")[0] ?? ""),
        );
        if (target !== undefined && /\.tsx?$/.test(target)) walk(target, owner);
        continue;
      }
      if (specifier.startsWith("node:") || isBuiltin(specifier)) continue;
      const name = packageName(specifier);
      if (!owner.runtime.has(name)) {
        problems.push(
          `${path} imports ${name} when it runs, but ${owner.dir}/package.json doesn't list it under dependencies, so a production image won't have it. Move it to dependencies.`,
        );
        continue;
      }
      const shared = owner.workspace.has(name) ? byName.get(name) : undefined;
      if (shared === undefined) continue;
      const subpath = `.${specifier.slice(name.length)}`;
      for (const [key, target] of Object.entries(shared.exports)) {
        const star = key.indexOf("*");
        const matches =
          star === -1
            ? key === subpath
            : subpath.startsWith(key.slice(0, star)) &&
              subpath.endsWith(key.slice(star + 1));
        if (!matches) continue;
        const filled =
          star === -1
            ? target
            : target.replace(
                "*",
                subpath.slice(star, subpath.length - (key.length - star - 1)),
              );
        const file = posix.join(shared.dir, filled);
        if (/\.tsx?$/.test(file) && files.has(file)) walk(file, shared);
      }
    }
  };

  for (const manifest of manifests) {
    const queue = ["start"];
    const ran = new Set<string>();
    for (
      let script = queue.shift();
      script !== undefined;
      script = queue.shift()
    ) {
      const command = manifest.scripts[script];
      if (command === undefined || ran.has(script)) continue;
      ran.add(script);
      const started = startedBy(command);
      queue.push(...started.scripts);
      for (const file of started.files) {
        const built = /^dist\/(.+)\.js$/.exec(file)?.[1];
        const entry = posix.join(
          manifest.dir,
          built === undefined ? file : `src/${built}.ts`,
        );
        const source = sourceOf(entry);
        if (source === undefined) {
          problems.push(
            `${manifest.dir}/package.json starts ${file}, which has no source file in the template. Check the start script, or teach tooling/repo-checks/src/runtime-dependencies.ts where its source is.`,
          );
          continue;
        }
        walk(source, manifest);
      }
    }
  }
  return problems;
}

/** create-robkit's templates: each manifest and TypeScript file, keyed by path from the templates' root. */
export async function readTemplates(
  root: string,
): Promise<Map<string, string>> {
  const templates = join(root, "packages", "create-robkit", "templates");
  const files: ScannedFile[] = [];
  for await (const entry of glob("**/{package.json,*.ts,*.tsx}", {
    cwd: templates,
    withFileTypes: true,
    exclude: (dirent) => ["node_modules", "dist"].includes(dirent.name),
  })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files.push({
      file: relative(templates, path).replaceAll("\\", "/"),
      text: await readFile(path, "utf8"),
    });
  }
  return new Map(files.map(({ file, text }) => [file, text]));
}
