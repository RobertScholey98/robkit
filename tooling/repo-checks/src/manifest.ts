// Reading the JSON files repo checks look at, package.json above all,
// through readers rather than casts. See docs/conventions/input.md.

import { readFile } from "node:fs/promises";
import {
  type InputProblem,
  isProblem,
  isRecord,
  parseJson,
} from "@robkit/input";

/**
 * The JSON file at `path`, read by `read`. A repo check can't go on without
 * it, so a file that isn't JSON, or that `read` refuses, throws its problem.
 */
export async function readJsonFile<T>(
  path: string,
  read: (json: unknown, source: string) => T | InputProblem,
): Promise<T> {
  const parsed = parseJson(await readFile(path, "utf8"), path);
  const value = isProblem(parsed) ? parsed : read(parsed.json, path);
  if (isProblem(value)) throw new Error(value.error);
  return value;
}

/** An export's target: a file, or conditions such as `types` naming files. */
export type ExportTarget = string | Readonly<Record<string, string>>;

export type Exports = Readonly<Record<string, ExportTarget>>;

type Strings = Readonly<Record<string, string>>;

const dependencyFields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

/** The fields of a package.json that repo checks read. */
export interface Manifest {
  name?: string;
  private?: boolean;
  scripts?: Strings;
  dependencies?: Strings;
  devDependencies?: Strings;
  peerDependencies?: Strings;
  optionalDependencies?: Strings;
  exports?: Exports;
  publishConfig?: { exports?: Exports };
  bin?: Strings;
}

/** Whether `value` maps names to strings, as `dependencies` does. */
export function isStrings(value: unknown): value is Strings {
  return (
    isRecord(value) &&
    Object.values(value).every((item) => typeof item === "string")
  );
}

function isExports(value: unknown): value is Exports {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (target) => typeof target === "string" || isStrings(target),
    )
  );
}

/** `json` as a package.json, or what's wrong with it. `source` names it. */
export function readManifest(
  json: unknown,
  source: string,
): Manifest | InputProblem {
  if (!isRecord(json)) return { error: `${source} must be a JSON object.` };
  const problem = (field: string, should: string): InputProblem => ({
    error: `${source}'s "${field}" ${should}.`,
  });
  const exportsRule =
    "must map each subpath to a file or to conditions naming files";
  const manifest: Manifest = {};

  const { name, private: isPrivate, scripts, bin, exports } = json;
  if (name !== undefined) {
    if (typeof name !== "string") return problem("name", "must be a string");
    manifest.name = name;
  }
  if (isPrivate !== undefined) {
    if (typeof isPrivate !== "boolean") {
      return problem("private", "must be true or false");
    }
    manifest.private = isPrivate;
  }
  for (const [field, value] of [
    ["scripts", scripts],
    ...dependencyFields.map((key) => [key, json[key]] as const),
    ["bin", bin],
  ] as const) {
    if (value === undefined) continue;
    if (!isStrings(value)) return problem(field, "must map names to strings");
    manifest[field] = value;
  }
  if (exports !== undefined) {
    if (!isExports(exports)) return problem("exports", exportsRule);
    manifest.exports = exports;
  }
  const { publishConfig } = json;
  if (publishConfig !== undefined) {
    if (!isRecord(publishConfig)) {
      return problem("publishConfig", "must be an object");
    }
    const published = publishConfig.exports;
    if (published !== undefined && !isExports(published)) {
      return problem("publishConfig.exports", exportsRule);
    }
    manifest.publishConfig =
      published === undefined ? {} : { exports: published };
  }
  return manifest;
}

/** A package.json with a name, as every workspace package's has. */
export type NamedManifest = Manifest & { name: string };

/** `json` as a package.json that names its package, or what's wrong. */
export function readNamedManifest(
  json: unknown,
  source: string,
): NamedManifest | InputProblem {
  const manifest = readManifest(json, source);
  if (isProblem(manifest)) return manifest;
  const { name } = manifest;
  return name === undefined
    ? { error: `${source} needs a "name", the package's name.` }
    : { ...manifest, name };
}
