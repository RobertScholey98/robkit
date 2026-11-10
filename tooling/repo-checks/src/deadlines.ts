// docs/conventions/errors.md: every request robkit sends has a deadline,
// an `AbortSignal.timeout`, alone or combined with the caller's signal
// through `AbortSignal.any`. This check finds each `fetch` call in the
// packages' source and the templates, through any object (`api.fetch`,
// `globalThis.fetch`), and fails one whose `signal` holds no
// `AbortSignal.timeout`. It follows names declared in the same file, so
// `const timeout = AbortSignal.timeout(ms)` then `signal: timeout` passes,
// and so do options held in a name. A signal built some other way, such
// as a controller aborted by a timer, needs an exception.

import { glob, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import ts from "typescript";
import type { ScannedFile } from "./glossary.ts";

/** A `fetch` call that isn't a request robkit sends, or whose caller sets the deadline. */
export interface Exception {
  file: string;
  /** The callee as the file spells it, such as `entry.fetch`. */
  call: string;
  why: string;
}

export const exceptions: readonly Exception[] = [
  {
    file: "packages/session/src/loopback-fetch.ts",
    call: "fetch",
    why: "jose's fetch implementation, which passes on the signal it's given. Its callers set the deadline: jose's 5-second default for core's keys, and coreAccess's AbortSignal.timeout(5000) for an access rule.",
  },
  {
    file: "packages/start/src/guarded.ts",
    call: "entry.fetch",
    why: "Start's server entry, called in the same process with the request the app received. It isn't a request robkit sends.",
  },
  {
    file: "packages/start/src/serve.ts",
    call: "entry.fetch",
    why: "Start's server entry, called in the same process with the request the app received. It isn't a request robkit sends.",
  },
];

/** A `fetch` call with no deadline: its callee as written, and its line. */
export interface Undeadlined {
  call: string;
  line: number;
}

/** Each name's initial values in the file, wherever it's declared. */
function declarations(source: ts.SourceFile): Map<string, ts.Expression[]> {
  const found = new Map<string, ts.Expression[]>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      const values = found.get(node.name.text) ?? [];
      found.set(node.name.text, [...values, node.initializer]);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function isTimeoutCall(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === "AbortSignal" &&
    callee.name.text === "timeout"
  );
}

/**
 * Whether `node` holds an `AbortSignal.timeout`, in itself or in the
 * values of the names it uses.
 */
function holdsTimeout(
  node: ts.Node,
  values: Map<string, ts.Expression[]>,
  seen = new Set<string>(),
): boolean {
  if (isTimeoutCall(node)) return true;
  if (ts.isIdentifier(node) && !seen.has(node.text)) {
    seen.add(node.text);
    if (
      (values.get(node.text) ?? []).some((value) =>
        holdsTimeout(value, values, seen),
      )
    ) {
      return true;
    }
  }
  return (
    ts.forEachChild(node, (child) => holdsTimeout(child, values, seen)) ?? false
  );
}

/** The object literal `options` is, directly or through a name. */
function objectOf(
  options: ts.Expression,
  values: Map<string, ts.Expression[]>,
): ts.ObjectLiteralExpression | undefined {
  if (ts.isObjectLiteralExpression(options)) return options;
  if (!ts.isIdentifier(options)) return undefined;
  return values.get(options.text)?.find(ts.isObjectLiteralExpression);
}

/** Whether a fetch's options give it a signal that times out. */
function hasDeadline(
  options: ts.Expression | undefined,
  values: Map<string, ts.Expression[]>,
): boolean {
  const object = options && objectOf(options, values);
  if (!object) return false;
  return object.properties.some((property) => {
    if (property.name === undefined || !ts.isIdentifier(property.name)) {
      return false;
    }
    if (property.name.text !== "signal") return false;
    if (ts.isShorthandPropertyAssignment(property)) {
      return holdsTimeout(property.name, values);
    }
    return (
      ts.isPropertyAssignment(property) &&
      holdsTimeout(property.initializer, values)
    );
  });
}

/** Whether `callee` is `fetch`, or `fetch` on some object. */
function isFetch(callee: ts.Expression): boolean {
  return (
    (ts.isIdentifier(callee) && callee.text === "fetch") ||
    (ts.isPropertyAccessExpression(callee) && callee.name.text === "fetch")
  );
}

/** Each `fetch` call in `code` whose options give it no deadline. */
export function undeadlinedFetches(
  code: string,
  kind: "ts" | "tsx" = "ts",
): Undeadlined[] {
  const source = ts.createSourceFile(
    `check.${kind}`,
    code,
    ts.ScriptTarget.Latest,
    true,
    kind === "tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const values = declarations(source);
  const found: Undeadlined[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      isFetch(node.expression) &&
      !hasDeadline(node.arguments[1], values)
    ) {
      found.push({
        call: node.expression.getText(source),
        line:
          source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/**
 * What's wrong in `files`: each `fetch` with no deadline that no exception
 * excuses, and each exception no such call needs.
 */
export function deadlineProblems(
  files: readonly ScannedFile[],
  excused: readonly Exception[] = exceptions,
): string[] {
  const used = new Set<Exception>();
  const problems = files.flatMap(({ file, text }) =>
    undeadlinedFetches(text, file.endsWith(".tsx") ? "tsx" : "ts").flatMap(
      ({ call, line }) => {
        const exception = excused.find(
          (e) => e.file === file && e.call === call,
        );
        if (exception) {
          used.add(exception);
          return [];
        }
        return [
          `${file}:${String(line)}: ${call}(...) has no deadline. Pass signal: AbortSignal.timeout(ms), or AbortSignal.any([callerSignal, AbortSignal.timeout(ms)]) to keep the caller's, as docs/conventions/errors.md says. If it isn't a request robkit sends, add an exception in tooling/repo-checks/src/deadlines.ts saying why.`,
        ];
      },
    ),
  );
  const unused = excused
    .filter((exception) => !used.has(exception))
    .map(
      ({ file, call }) =>
        `deadlines.ts excuses ${call} in ${file}, which has no such call without a deadline. Delete the exception.`,
    );
  return [...problems, ...unused];
}

/** The packages' source and the templates' code, tests left out, with paths from `root`. */
export async function readOutboundCode(root: string): Promise<ScannedFile[]> {
  const files: ScannedFile[] = [];
  for await (const entry of glob(
    [
      "packages/*/src/**/*.{ts,tsx}",
      "packages/create-robkit/templates/**/*.{ts,tsx}",
    ],
    {
      cwd: root,
      withFileTypes: true,
      exclude: (dirent) =>
        ["node_modules", "dist", "test"].includes(dirent.name) ||
        /\.test(-d)?\.tsx?$/.test(dirent.name),
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
