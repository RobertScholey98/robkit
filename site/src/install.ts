// What an install needs on the reader's machine, read from the templates
// `npm create robkit` copies, so a page can't promise another version.

import { readRepoFile } from "./repo.ts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The lowest Node a package.json's `engines.node` allows, such as `24` for
 * `>=24`. `source` names the file in the error.
 */
export function nodeVersion(json: unknown, source: string): string {
  const engines = isRecord(json) ? json.engines : undefined;
  const range = isRecord(engines) ? engines.node : undefined;
  const lowest =
    typeof range === "string" ? /^>=\s*(\d+(?:\.\d+)*)$/.exec(range) : null;
  if (lowest?.[1] === undefined) {
    throw new Error(
      `${source} needs an engines.node of the form ">=24", which the docs show as the Node an install needs.`,
    );
  }
  return lowest[1];
}

/** The Go a go.mod's `go` line asks for, to its minor version: `1.26`. */
export function goVersion(goMod: string, source: string): string {
  const line = /^go (1\.\d+)(?:\.\d+)?\r?$/m.exec(goMod);
  if (line?.[1] === undefined) {
    throw new Error(
      `${source} has no "go 1.N" line, which the docs show as the Go a React + Go app needs.`,
    );
  }
  return line[1];
}

/** The lowest Node an install runs on, from its package.json. */
export async function installNodeVersion(): Promise<string> {
  const json: unknown = JSON.parse(
    await readRepoFile("packages/create-robkit/templates/base/package.json"),
  );
  return nodeVersion(
    json,
    "packages/create-robkit/templates/base/package.json",
  );
}

/** The lowest Go a React + Go app builds with, from its template's go.mod. */
export async function installGoVersion(): Promise<string> {
  return goVersion(
    await readRepoFile("packages/create-robkit/templates/stacks/go/go.mod"),
    "packages/create-robkit/templates/stacks/go/go.mod",
  );
}
