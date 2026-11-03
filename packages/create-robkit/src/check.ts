import { readdir, readFile } from "node:fs/promises";
import { extname, join, posix } from "node:path";
import { sessionCookie } from "@robkit/session";
import ts from "typescript";

/** An app in an install: `apps/<slug>`, with its manifest's package name. */
interface App {
  slug: string;
  /** Its folder from the install root, such as `apps/hub`. */
  folder: string;
  name: string | undefined;
}

/** Something an app's file uses that the layer rule looks at. */
type Use =
  | {
      kind: "import";
      specifier: string;
      /** For a relative import, its target from the install root. */
      target: string | undefined;
    }
  | { kind: "string"; value: string };

/** One rule of the layer rule, and how a use in an app's file breaks it. */
export interface LayerRow {
  /** What `robkit check` prints, naming the rule. */
  rule: string;
  applies: (app: App) => boolean;
  breaks: (use: Use, app: App, apps: readonly App[]) => boolean;
}

/** Whether `path`, from the install root, is `folder` or inside it. */
function inside(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

/** Whether `specifier` names `module` or one of its subpaths. */
function names(specifier: string, module: string): boolean {
  return specifier === module || specifier.startsWith(`${module}/`);
}

const notCore = (app: App) => app.slug !== "core";

/**
 * The layer rule in an install, one row per rule. `robkit check` is its only
 * implementation, so it holds whichever linter the install chose.
 */
export const layerRule: readonly LayerRow[] = [
  {
    rule: "Layer rule: an app imports only its own files, @robkit/* packages and shared packages/*. It never imports another app.",
    applies: () => true,
    breaks: (use, app, apps) =>
      use.kind === "import" &&
      (use.target === undefined
        ? apps.some(
            (other) =>
              other !== app &&
              other.name !== undefined &&
              names(use.specifier, other.name),
          )
        : !inside(use.target, app.folder)),
  },
  {
    rule: "Layer rule: an app reaches core over HTTP only, never through @robkit/core.",
    applies: notCore,
    breaks: (use) =>
      use.kind === "import" &&
      (names(use.specifier, "@robkit/core") ||
        (use.target !== undefined && inside(use.target, "apps/core"))),
  },
  {
    rule: "Layer rule: handlers take the viewer from their adapter. App code never reads the session cookie or verifies a token itself.",
    applies: notCore,
    breaks: (use) =>
      use.kind === "import"
        ? // The bare entry holds the token and its cookie; its subpaths
          // (addresses, lapsed) hold neither.
          use.specifier === "@robkit/session" || names(use.specifier, "jose")
        : use.value.includes(sessionCookie),
  },
];

/** A use that breaks a rule, where it is. */
export interface Problem {
  /** The file, from the install root. */
  file: string;
  line: number;
  column: number;
  rule: string;
}

const scriptKinds: Record<string, ts.ScriptKind> = {
  ".ts": ts.ScriptKind.TS,
  ".mts": ts.ScriptKind.TS,
  ".cts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
  ".js": ts.ScriptKind.JS,
  ".mjs": ts.ScriptKind.JS,
  ".cjs": ts.ScriptKind.JS,
  ".jsx": ts.ScriptKind.JSX,
};

/** Folders that hold no code an app's author wrote. */
const skipped = new Set(["node_modules", "dist", "build"]);

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** The install's apps: each folder under `apps/` with a `package.json`. */
async function appsOf(root: string): Promise<App[]> {
  const entries = await readdir(join(root, "apps"), {
    withFileTypes: true,
  }).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  });
  const apps: App[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const folder = `apps/${entry.name}`;
    const manifest = (await readJson(join(root, folder, "package.json"))) as
      { name?: string } | undefined;
    if (manifest === undefined) continue;
    apps.push({ slug: entry.name, folder, name: manifest.name });
  }
  return apps.sort((a, b) => (a.slug < b.slug ? -1 : 1));
}

/** Every script file under `dir`, by its path from `root`. */
async function scriptsIn(root: string, dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(join(root, dir), { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const entry of entries) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!skipped.has(entry.name) && !entry.name.startsWith(".")) {
        files.push(...(await scriptsIn(root, path)));
      }
    } else if (extname(entry.name) in scriptKinds) {
      files.push(path);
    }
  }
  return files;
}

/** The imports and strings in a file, each with where it starts. */
function usesIn(
  file: string,
  text: string,
): { use: Use; node: ts.Node; source: ts.SourceFile }[] {
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKinds[extname(file)],
  );
  const found: { use: Use; node: ts.Node; source: ts.SourceFile }[] = [];
  const imported = (node: ts.Node | undefined) => {
    if (node === undefined || !ts.isStringLiteralLike(node)) return;
    const specifier = node.text;
    const target = /^\.\.?(\/|$)/.test(specifier)
      ? posix.join(posix.dirname(file), specifier)
      : undefined;
    found.push({ use: { kind: "import", specifier, target }, node, source });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      imported(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      imported(node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      imported(node.arguments[0]);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument)
    ) {
      imported(node.argument.literal);
    }
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
      found.push({ use: { kind: "string", value: node.text }, node, source });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/**
 * Every place an app in the install at `root` breaks the layer rule, in file
 * order. An empty list means the rule holds.
 */
export async function checkInstall(root: string): Promise<Problem[]> {
  const apps = await appsOf(root);
  const problems: Problem[] = [];
  for (const app of apps) {
    const rows = layerRule.filter((row) => row.applies(app));
    for (const file of await scriptsIn(root, app.folder)) {
      const text = await readFile(join(root, file), "utf8");
      for (const { use, node, source } of usesIn(file, text)) {
        for (const row of rows) {
          if (!row.breaks(use, app, apps)) continue;
          const { line, character } = source.getLineAndCharacterOfPosition(
            node.getStart(source),
          );
          problems.push({
            file,
            line: line + 1,
            column: character + 1,
            rule: row.rule,
          });
        }
      }
    }
  }
  return problems;
}

/** How `robkit check` prints a problem: where it is, then the rule. */
export function describeProblem(problem: Problem): string {
  return `${problem.file}:${String(problem.line)}:${String(problem.column)}  ${problem.rule}`;
}
