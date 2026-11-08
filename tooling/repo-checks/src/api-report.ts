import { join, posix } from "node:path";
import { format, resolveConfig } from "prettier";
import ts from "typescript";
import { readJsonFile, readNamedManifest, type Manifest } from "./manifest.ts";

/** Each entry point the packed package declares types for, by its subpath. */
function typedEntries(manifest: Manifest): [string, string][] {
  const exports = manifest.publishConfig?.exports ?? manifest.exports ?? {};
  return Object.entries(exports).flatMap(([subpath, target]) =>
    typeof target === "object" && target.types !== undefined
      ? [[subpath, target.types] as [string, string]]
      : [],
  );
}

const printer = ts.createPrinter({ removeComments: true });

/** One declaration as the report shows it: exported, without `declare`. */
function printDeclaration(
  checker: ts.TypeChecker,
  name: string,
  declaration: ts.Declaration,
): string {
  const source = declaration.getSourceFile();
  if (ts.isVariableDeclaration(declaration)) {
    const list = declaration.parent;
    const keyword = list.flags & ts.NodeFlags.Const ? "const" : "let";
    // A constant with a literal value has no type annotation: it is `= "x"`.
    const type = declaration.type
      ? printer.printNode(ts.EmitHint.Unspecified, declaration.type, source)
      : checker.typeToString(
          checker.getTypeAtLocation(declaration),
          undefined,
          ts.TypeFormatFlags.NoTruncation,
        );
    return `export ${keyword} ${name}: ${type};`;
  }
  const text = printer
    .printNode(ts.EmitHint.Unspecified, declaration, source)
    .replace(/^(export )?(declare )?/, "export ");
  const declared = ts.getNameOfDeclaration(declaration)?.getText(source);
  return declared === undefined || declared === name
    ? text
    : `// Exported as ${name}.\n${text}`;
}

/** Every export of one entry point, sorted by name, as declarations. */
function entryApi(checker: ts.TypeChecker, file: ts.SourceFile): string[] {
  const module = checker.getSymbolAtLocation(file);
  if (module === undefined) return [];
  return checker
    .getExportsOfModule(module)
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((exported) => {
      const symbol =
        exported.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(exported)
          : exported;
      return (symbol.declarations ?? []).map((declaration) =>
        printDeclaration(checker, exported.name, declaration),
      );
    });
}

/**
 * The public API of the package in `dir`: for each entry point its packed
 * manifest declares types for, every exported name with its type, read from
 * the built declarations. Formatted with the repo's Prettier config, so it is
 * the file `pnpm format` would leave.
 */
export async function apiReport(dir: string): Promise<string> {
  const manifest = await readJsonFile(
    join(dir, "package.json"),
    readNamedManifest,
  );
  const entries = typedEntries(manifest);
  const program = ts.createProgram(
    entries.map(([, types]) => join(dir, types)),
    {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      target: ts.ScriptTarget.ES2024,
      noEmit: true,
      skipLibCheck: true,
    },
  );
  const checker = program.getTypeChecker();
  const sections = entries.map(([subpath, types]) => {
    const file = program.getSourceFile(join(dir, types));
    if (file === undefined) {
      throw new Error(`${manifest.name} has no ${types}. Build it first.`);
    }
    const specifier = posix.join(manifest.name, subpath);
    const api = entryApi(checker, file);
    return [
      `## ${specifier}`,
      "",
      "```ts",
      ...(api.length === 0 ? ["// Exports nothing."] : api),
      "```",
    ].join("\n");
  });
  const report = [
    `# ${manifest.name} API`,
    "",
    "Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.",
    "",
    ...sections.flatMap((section) => [section, ""]),
  ].join("\n");
  const path = join(dir, "api-report.md");
  return format(report, {
    ...(await resolveConfig(path)),
    filepath: path,
  });
}
