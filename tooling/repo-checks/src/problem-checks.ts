// A reader returns its value or an InputProblem, and isProblem is the one
// check for which (docs/conventions/input.md). A `typeof x !== "string"`
// on a reader's result happens to work for a string reader, so lint can't
// tell it from any other typeof. This check finds it in the syntax tree,
// following readers imported under another name, awaited calls, and names
// declared on one line and assigned on another.

import { glob, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import ts from "typescript";
import { examplesIn } from "./doc-examples.ts";
import type { ScannedFile } from "./glossary.ts";

/** A reader is named for what it reads, such as `readCoreUrl`. */
const readerName = /^read[A-Z]/;

/** The local names a file's imports give its readers, aliases included. */
function importedReaders(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const { name, propertyName } of bindings.elements) {
      if (readerName.test((propertyName ?? name).text)) names.add(name.text);
    }
  }
  return names;
}

/** `node` without the parentheses, `await` and `!` around it. */
function unwrap(node: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(node) ||
    ts.isAwaitExpression(node) ||
    ts.isNonNullExpression(node)
    ? unwrap(node.expression)
    : node;
}

/** Whether `node` calls a reader: by its name, an import's alias, or `module.readX`. */
function callsReader(node: ts.Expression, imported: Set<string>): boolean {
  const call = unwrap(node);
  if (!ts.isCallExpression(call)) return false;
  const callee = call.expression;
  if (ts.isIdentifier(callee)) {
    return readerName.test(callee.text) || imported.has(callee.text);
  }
  return (
    ts.isPropertyAccessExpression(callee) && readerName.test(callee.name.text)
  );
}

/** The name `typeof name !== "string"` tests, either way round, or undefined. */
function notStringCheck(node: ts.BinaryExpression): string | undefined {
  const { operatorToken, left, right } = node;
  const kind = operatorToken.kind;
  if (
    kind !== ts.SyntaxKind.ExclamationEqualsEqualsToken &&
    kind !== ts.SyntaxKind.ExclamationEqualsToken
  ) {
    return undefined;
  }
  const [typeOf, string] = ts.isTypeOfExpression(unwrap(left))
    ? [unwrap(left), right]
    : [unwrap(right), left];
  if (!ts.isTypeOfExpression(typeOf) || !ts.isStringLiteral(string)) {
    return undefined;
  }
  const tested = unwrap(typeOf.expression);
  return string.text === "string" && ts.isIdentifier(tested)
    ? tested.text
    : undefined;
}

/**
 * The names in `code` that hold a reader's result and are guarded with
 * `typeof name !== "string"`, where `isProblem(name)` belongs.
 */
export function typeofReadChecks(
  code: string,
  kind: "ts" | "tsx" = "ts",
): string[] {
  const source = ts.createSourceFile(
    `check.${kind}`,
    code,
    ts.ScriptTarget.Latest,
    false,
    kind === "tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imported = importedReaders(source);
  const results = new Set<string>();
  const checked = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      callsReader(node.initializer, imported)
    ) {
      results.add(node.name.text);
    }
    if (ts.isBinaryExpression(node)) {
      if (
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left) &&
        callsReader(node.right, imported)
      ) {
        results.add(node.left.text);
      }
      const name = notStringCheck(node);
      if (name !== undefined) checked.add(name);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...results].filter((name) => checked.has(name));
}

/** The TypeScript in a scanned file: a source file whole, or a doc's fences. */
export function codeIn({
  file,
  text,
}: ScannedFile): { code: string; kind: "ts" | "tsx" }[] {
  if (file.endsWith(".md")) {
    return examplesIn(file, text, { nocheck: true }).map(({ code, lang }) => ({
      code,
      kind: lang,
    }));
  }
  return [{ code: text, kind: file.endsWith(".tsx") ? "tsx" : "ts" }];
}

/** robkit's source, the templates and the docs, with their paths from `root`. */
export async function readCodeAndDocs(root: string): Promise<ScannedFile[]> {
  const files: ScannedFile[] = [];
  for await (const entry of glob(
    [
      "packages/*/src/**/*.{ts,tsx}",
      "packages/create-robkit/templates/**/*.{ts,tsx}",
      "packages/*/README.md",
      "docs/**/*.md",
    ],
    {
      cwd: root,
      withFileTypes: true,
      exclude: (dirent) => ["node_modules", "dist"].includes(dirent.name),
    },
  )) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files.push({
      file: relative(root, path).replaceAll("\\", "/"),
      text: await readFile(path, "utf8"),
    });
  }
  return files.sort((a, b) => a.file.localeCompare(b.file));
}
