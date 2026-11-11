import { lstat, readdir, readFile, stat } from "node:fs/promises";
import { extname, join, posix } from "node:path";
import { appManifestFileIn } from "@robkit/dev";
import { CommandProblem, isMissing } from "@robkit/dev/cli";
import { sessionCookie } from "@robkit/session";
import { isProblem, isRecord, parseJson } from "@robkit/input";
import ts from "typescript";
import { goStringsIn } from "./go-strings.ts";

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
      /**
       * Whether the target sits under a folder the scan doesn't read, which
       * only a relative import can reach. Never set for one `.d.ts` file's
       * import of another.
       */
      unread: boolean;
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
    rule: "Layer rule: an app or shared package imports no file under node_modules, dist, build, a dot-folder or a symlinked folder, since robkit check doesn't read them. Keep source out of those folders, and import a package by its name.",
    applies: () => true,
    breaks: (use) => use.kind === "import" && use.unread,
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

/** Whether the scan skips a folder by its name. */
function skips(name: string): boolean {
  return skipped.has(name) || name.startsWith(".");
}

/** What is at a path on disk. */
interface Entry {
  /** Whether it is a folder, following a symlink. */
  folder: boolean;
  link: boolean;
}

/** What is at `path`, from `root`, or undefined when nothing is. */
async function entryAt(root: string, path: string): Promise<Entry | undefined> {
  try {
    const link = (await lstat(join(root, path))).isSymbolicLink();
    const folder = (await stat(join(root, path))).isDirectory();
    return { folder, link };
  } catch (error) {
    // A part along the path that is a file, or a link to nothing.
    if (isMissing(error) || (isRecord(error) && error.code === "ENOTDIR")) {
      return undefined;
    }
    throw error;
  }
}

/**
 * Whether `target`, a relative import's target from `root`, is or sits
 * under a folder the scan skips. It looks at each folder along the path on
 * disk, so a symlink part-way along counts. A target above the install is
 * another rule's.
 */
async function unreadTarget(root: string, target: string): Promise<boolean> {
  if (target === ".." || target.startsWith("../")) return false;
  const parts = target.split("/");
  let onDisk = true;
  for (const [i, name] of parts.entries()) {
    const entry: Entry | undefined = onDisk
      ? await entryAt(root, parts.slice(0, i + 1).join("/"))
      : undefined;
    onDisk = entry !== undefined;
    // Its last part may be a file, such as `build.ts`, which the scan reads.
    const folder = i < parts.length - 1 || entry?.folder === true;
    if (folder && skips(name)) return true;
    if (entry?.link === true && entry.folder) return true;
  }
  return false;
}

/** Whether `path` names a `.d.ts` file, which holds types, not code. */
function isTypesFile(path: string): boolean {
  return /\.d\.[cm]?ts$/.test(path);
}

/**
 * Whether `file` hides source from the scan by importing `target`, a
 * relative import's target from `root`. A `.d.ts` file that imports
 * another is let through, wherever the other is, since types don't run.
 * Next writes such a file, `next-env.d.ts`, to an app's folder, with
 * imports of the types it generated in the build's folder. `SECURITY.md`
 * lists the way past the check that this leaves.
 */
async function hidesSource(
  root: string,
  file: string,
  target: string,
): Promise<boolean> {
  if (isTypesFile(file) && isTypesFile(target)) return false;
  return unreadTarget(root, target);
}

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
          ? await appManifestFileIn(root, entry.name)
          : await packageNameIn(root, folder);
      if (manifest === undefined) continue;
      found.push({ kind, slug: entry.name, folder, name: manifest.name });
    }
    areas.push(...found.sort((a, b) => (a.slug < b.slug ? -1 : 1)));
  }
  return areas;
}

/** Every script or Go file under `dir`, by its path from `root`. */
async function scriptsIn(root: string, dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(join(root, dir), { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const entry of entries) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!skips(entry.name)) {
        files.push(...(await scriptsIn(root, path)));
      }
    } else if (
      extname(entry.name) in scriptKinds ||
      entry.name.endsWith(".go")
    ) {
      files.push(path);
    }
  }
  return files;
}

/** A use in a file, and the line and column, from 1, where it starts. */
interface Placed {
  use: Use;
  line: number;
  column: number;
}

/**
 * The imports and strings in a file, each with where it starts. A Go file's
 * are its strings: the Go apps' imports are Go modules, which the layer
 * rule doesn't name.
 */
function usesIn(file: string, text: string): Placed[] {
  if (file.endsWith(".go")) {
    return goStringsIn(text).map(({ value, line, column }) => ({
      use: { kind: "string", value },
      line,
      column,
    }));
  }
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKinds[extname(file)],
  );
  const found: Placed[] = [];
  const add = (use: Use, node: ts.Node) => {
    const { line, character } = source.getLineAndCharacterOfPosition(
      node.getStart(source),
    );
    found.push({ use, line: line + 1, column: character + 1 });
  };
  const imported = (node: ts.Node | undefined) => {
    if (node === undefined || !ts.isStringLiteralLike(node)) return;
    const specifier = node.text;
    const target = /^\.\.?(\/|$)/.test(specifier)
      ? posix.join(posix.dirname(file), specifier)
      : undefined;
    add({ kind: "import", specifier, target, unread: false }, node);
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
      add({ kind: "string", value: node.text }, node);
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
      for (const placed of usesIn(file, text)) {
        const { line, column } = placed;
        const use =
          placed.use.kind === "import" && placed.use.target !== undefined
            ? {
                ...placed.use,
                unread: await hidesSource(root, file, placed.use.target),
              }
            : placed.use;
        for (const row of rows) {
          if (row.breaks(use, area, areas)) {
            violations.push({ file, line, column, rule: row.rule });
          }
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
