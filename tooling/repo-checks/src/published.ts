import { exec, execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  checkPackage,
  createPackageFromTarballData,
} from "@arethetypeswrong/core";
import { problemKindInfo } from "@arethetypeswrong/core/problems";
import { publint, type Message } from "publint";
import { formatMessage } from "publint/utils";

const run = promisify(execFile);
// A shell finds pnpm.cmd on Windows, which execFile won't run.
const shell = promisify(exec);

const packagesDir = fileURLToPath(
  new URL("../../../packages", import.meta.url),
);

/** The folder of each package this repo publishes: each under `packages/` that isn't private. */
export async function publishedPackages(): Promise<string[]> {
  const dirs: string[] = [];
  for (const entry of await readdir(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(packagesDir, entry.name);
    const json = JSON.parse(
      await readFile(join(dir, "package.json"), "utf8"),
    ) as { private?: boolean };
    if (!json.private) dirs.push(dir);
  }
  return dirs;
}

/** What a packed package tells Node to load, and which files it holds. */
export interface Packed {
  name: string;
  /** Each export and bin target, as the packed manifest names it. */
  targets: string[];
  /** Every file in the tarball, relative to the package root. */
  files: string[];
  /** The tarball itself, gzipped. */
  tarball: Uint8Array;
}

interface PackedManifest {
  name: string;
  exports?: Record<string, string | Record<string, string>>;
  bin?: Record<string, string>;
}

/**
 * Packs the package in `dir` as `pnpm publish` would, and reads back what
 * the tarball's manifest points at.
 */
export async function pack(dir: string): Promise<Packed> {
  const out = await mkdtemp(join(tmpdir(), "robkit-pack-"));
  try {
    await shell(`pnpm pack --pack-destination "${out}"`, { cwd: dir });
    const [tarball] = await readdir(out);
    if (!tarball) throw new Error(`pnpm pack wrote nothing for ${dir}`);
    const { stdout: list } = await run("tar", ["-tzf", tarball], { cwd: out });
    const { stdout: manifest } = await run(
      "tar",
      ["-xOzf", tarball, "package/package.json"],
      { cwd: out },
    );
    const json = JSON.parse(manifest) as PackedManifest;
    const targets = [
      ...Object.values(json.exports ?? {}).flatMap((target) =>
        typeof target === "string" ? [target] : Object.values(target),
      ),
      ...Object.values(json.bin ?? {}),
    ];
    return {
      name: json.name,
      targets,
      files: list
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => line.replace(/^package\//, "")),
      tarball: new Uint8Array(await readFile(join(out, tarball))),
    };
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}

/**
 * Why a packed package won't run from `node_modules`, where Node doesn't
 * strip types: a target that is TypeScript source, or one the tarball lacks.
 */
export function packProblems({
  name,
  targets,
  files,
}: Pick<Packed, "name" | "targets" | "files">): string[] {
  return targets.flatMap((target) => {
    const file = target.replace(/^\.\//, "");
    if (file.endsWith(".ts") && !file.endsWith(".d.ts")) {
      return [`${name} points at TypeScript source: ${target}`];
    }
    if (!files.includes(file)) return [`${name} lacks ${target}`];
    return [];
  });
}

/**
 * Whether publint's message is about a manifest in create-robkit's templates,
 * where `exports` is right: the generator writes them into an install as
 * that install's own packages.
 */
function templateManifest(message: Message): boolean {
  return (
    message.code === "NESTED_PACKAGE_JSON_FIELD_IGNORED" &&
    message.args.filePath.startsWith("./templates/")
  );
}

/**
 * What publint finds wrong with a packed manifest, at warning level or worse:
 * an export that points at a missing file, conditions in the wrong order, a
 * module format the file doesn't match.
 */
export async function publintProblems({
  name,
  tarball,
}: Packed): Promise<string[]> {
  const { messages, pkg } = await publint({
    pack: { tarball: tarball.slice().buffer },
    level: "warning",
    strict: true,
  });
  return messages
    .filter((message) => !templateManifest(message))
    .map(
      (message) =>
        `${name}: ${formatMessage(message, pkg, { color: false }) ?? message.code}`,
    );
}

/**
 * Resolutions an ESM-only package doesn't serve: `require` under Node, and
 * TypeScript's pre-exports `node10` resolution.
 */
const notServed = new Set(["node10", "node16-cjs"]);

/**
 * What Are the Types Wrong finds wrong with a packed package's types, as
 * TypeScript resolves them under Node's ESM and under a bundler: an entry
 * with no types, types for the wrong module format, a missing named export.
 */
export async function attwProblems({
  name,
  tarball,
}: Packed): Promise<string[]> {
  const result = await checkPackage(createPackageFromTarballData(tarball));
  if (!result.types) return [`${name} ships no types`];
  return result.problems
    .filter(
      (problem) =>
        !("resolutionKind" in problem) ||
        !notServed.has(problem.resolutionKind),
    )
    .map((problem) => {
      const where =
        "entrypoint" in problem
          ? ` at ${problem.entrypoint} under ${problem.resolutionKind}`
          : "";
      return `${name}${where}: ${problemKindInfo[problem.kind].title}`;
    });
}
