import { exec, execFile } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
// A shell finds pnpm.cmd on Windows, which execFile won't run.
const shell = promisify(exec);

/** What a packed package tells Node to load, and which files it holds. */
export interface Packed {
  name: string;
  /** Each export and bin target, as the packed manifest names it. */
  targets: string[];
  /** Every file in the tarball, relative to the package root. */
  files: string[];
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
    };
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}

/**
 * Why a packed package won't run from `node_modules`, where Node doesn't
 * strip types: a target that is TypeScript source, or one the tarball lacks.
 */
export function packProblems({ name, targets, files }: Packed): string[] {
  return targets.flatMap((target) => {
    const file = target.replace(/^\.\//, "");
    if (file.endsWith(".ts") && !file.endsWith(".d.ts")) {
      return [`${name} points at TypeScript source: ${target}`];
    }
    if (!files.includes(file)) return [`${name} lacks ${target}`];
    return [];
  });
}
