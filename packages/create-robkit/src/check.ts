import { readdir, readFile } from "node:fs/promises";
import { extname, join, posix } from "node:path";
import { appManifestIn } from "@robkit/dev";
import { CommandProblem, isMissing } from "@robkit/dev/cli";
import { sessionCookie } from "@robkit/session";
import { isProblem, isRecord, parseJson } from "@robkit/session/input";
import ts from "typescript";

/**
 * Code the layer rule binds: an app, `apps/<slug>`, or a shared package,
 * `packages/<name>`, with its manifest's package name. A shared package's
 * code runs inside the apps that import it, so the rule binds it too.
 */
interface Area {
  kind: "app" | "shared package";
  /** Its folder's name, which for an app is its slug. */
  slug: string;
  /** Its folder from the install root, such as `apps/hub`. */
  folder: string;
  name: string | undefined;
}

/** Something a file uses that the layer rule looks at. */
type Use =
  | {
      kind: "import";
      specifier: string;
      /** For a relative import, its target from the install root. */
      target: string | undefined;
    }
  | { kind: "string"; value: string };

/** One rule of the layer rule, and how a use in an area's file breaks it. */
export interface LayerRow {
  /** What `robkit check` prints, naming the rule. */
  rule: string;
  applies: (area: Area) => boolean;
  breaks: (use: Use, area: Area, areas: readonly Area[]) => boolean;
}

/** Whether `path`, from the install root, is `folder` or inside it. */
function inside(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

/** Whether `specifier` names `module` or one of its subpaths. */
function names(specifier: string, module: string): boolean {
  return specifier === module || specifier.startsWith(`${module}/`);
}

const notCore = (area: Area) => area.kind !== "app" || area.slug !== "core";

/**
 * Whether `use` leaves `area`: a relative import outside its folder, or an
 * import of another app by its package name.
 */
function leaves(use: Use, area: Area, areas: readonly Area[]): boolean {
  if (use.kind !== "import") return false;
  if (use.target !== undefined) return !inside(use.target, area.folder);
  return areas.some(
    (other) =>
      other !== area &&
      other.kind === "app" &&
      other.name !== undefined &&
      names(use.specifier, other.name),
  );
}

/**
 * The layer rule in an install, one row per rule. `robkit check` is its only
 * implementation, so it holds whichever linter the install chose.
 */
export const layerRule: readonly LayerRow[] = [
  {
    rule: "Layer rule: an app imports only its own files, @robkit/* packages and shared packages/*. It never imports another app.",
    applies: (area) => area.kind === "app",
    breaks: leaves,
  },
  {
    rule: "Layer rule: a shared package imports only its own files, @robkit/* packages and other shared packages/*. It never imports an app.",
    applies: (area) => area.kind === "shared package",
    breaks: leaves,
  },
  {
    rule: "Layer rule: an app or shared package reaches core over HTTP only, never through @robkit/core.",
    applies: notCore,
    breaks: (use) =>
      use.kind === "import" &&
      (names(use.specifier, "@robkit/core") ||
        (use.target !== undefined && inside(use.target, "apps/core"))),
  },
  {
    rule: "Layer rule: handlers take the viewer from their adapter. No app or shared package reads the session cookie or verifies a token itself.",
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
export interface Violation {
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

/** Folders that hold no code the install's author wrote. */
const skipped = new Set(["node_modules", "dist", "build"]);

/**
 * The `name` in a shared package's `package.json`, or undefined when the
 * folder has none. A manifest that isn't a JSON object is a problem that
 * names the file.
 */
async function packageNameIn(
  root: string,
  folder: string,
): Promise<{ name: string | undefined } | undefined> {
  const file = `${folder}/package.json`;
  let text: string;
  try {
    text = await readFile(join(root, file), "utf8");
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
  const parsed = parseJson(text, file);
  if (isProblem(parsed)) throw new CommandProblem(parsed.error);
  if (!isRecord(parsed.json)) {
    throw new CommandProblem(
      `${file} must be a JSON object. Fix it, or delete it.`,
    );
  }
  const { name } = parsed.json;
  return { name: typeof name === "string" ? name : undefined };
}

/**
 * The install's apps, then its shared packages: each folder under `apps/` or
 * `packages/` with a `package.json`. An app's manifest goes through dev's
 * reader, as `pnpm dev` reads it.
 */
async function areasOf(root: string): Promise<Area[]> {
  const areas: Area[] = [];
  for (const [parent, kind] of [
    ["apps", "app"],
    ["packages", "shared package"],
  ] as const) {
    const entries = await readdir(join(root, parent), {
      withFileTypes: true,
    }).catch((error: unknown) => {
      if (isMissing(error)) return [];
      throw error;
    });
    const found: Area[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const folder = `${parent}/${entry.name}`;
      const manifest =
        kind === "app"
          ? await appManifestIn(root, entry.name)
          : await packageNameIn(root, folder);
      if (manifest === undefined) continue;
      found.push({ kind, slug: entry.name, folder, name: manifest.name });
    }
    areas.push(...found.sort((a, b) => (a.slug < b.slug ? -1 : 1)));
  }
  return areas;
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
 * Every place an app or shared package in the install at `root` breaks the
 * layer rule, in file order. An empty list means the rule holds.
 */
export async function checkInstall(root: string): Promise<Violation[]> {
  const areas = await areasOf(root);
  const violations: Violation[] = [];
  for (const area of areas) {
    const rows = layerRule.filter((row) => row.applies(area));
    for (const file of await scriptsIn(root, area.folder)) {
      const text = await readFile(join(root, file), "utf8");
      for (const { use, node, source } of usesIn(file, text)) {
        for (const row of rows) {
          if (!row.breaks(use, area, areas)) continue;
          const { line, character } = source.getLineAndCharacterOfPosition(
            node.getStart(source),
          );
          violations.push({
            file,
            line: line + 1,
            column: character + 1,
            rule: row.rule,
          });
        }
      }
    }
  }
  return violations;
}

/** How `robkit check` prints a violation: where it is, then the rule. */
export function describeViolation(violation: Violation): string {
  return `${violation.file}:${String(violation.line)}:${String(violation.column)}  ${violation.rule}`;
}
