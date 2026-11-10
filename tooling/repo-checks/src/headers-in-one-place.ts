// The headers robkit sends are written once, in @robkit/input/headers, so
// the guard, core and the hub can't drift apart. Go's port writes them
// again in go/session, which this doesn't read. Tests may write the values
// they expect.

import { glob, readFile } from "node:fs/promises";
import { join } from "node:path";

/** Where the headers' values live. */
export const headersFile = "packages/input/src/headers.ts";

/** A header value robkit sends, as a string literal in code. */
const value =
  /["'](nosniff|SAMEORIGIN|DENY|frame-ancestors 'none'|max-age=31536000)["']/;

/** Whether `path` is code robkit runs: no build output, tests or helpers. */
function isRunningCode(path: string): boolean {
  const parts = path.replaceAll("\\", "/").split("/");
  const name = parts.at(-1) ?? "";
  return (
    !parts.includes("node_modules") &&
    !parts.includes("dist") &&
    !parts.join("/").includes("/src/test/") &&
    !/\.test(-d)?\.tsx?$/.test(name) &&
    !name.endsWith(".d.ts")
  );
}

/** The TypeScript robkit and its templates run, by path from `root`. */
export async function readRunningCode(
  root: string,
): Promise<{ path: string; text: string }[]> {
  const files: { path: string; text: string }[] = [];
  const paths = glob("packages/**/*.{ts,tsx}", {
    cwd: root,
    exclude: (path) => /(^|[/\\])(node_modules|dist)$/.test(path),
  });
  for await (const found of paths) {
    const path = found.replaceAll("\\", "/");
    if (!isRunningCode(path)) continue;
    files.push({ path, text: await readFile(join(root, path), "utf8") });
  }
  return files;
}

/** A line for each place outside `headersFile` that writes a header's value. */
export function headerValueProblems(
  files: readonly { path: string; text: string }[],
): string[] {
  return files
    .filter(({ path }) => path !== headersFile)
    .flatMap(({ path, text }) =>
      text.split("\n").flatMap((line, index) => {
        const found = value.exec(line);
        return found
          ? [
              `${path}:${String(index + 1)} writes ${found[0]}, a header robkit sends. Take it from @robkit/input/headers, where ${headersFile} writes each one.`,
            ]
          : [];
      }),
    );
}
